// ==UserScript==
// @name         YouTube Music Album Sorter
// @namespace    https://github.com/example/youtubemusicsort
// @version      3.3.0
// @description  YouTube Music でアルバムを検索した際に、リリース年でソートします。「年代順にソート」ボタンをクリックしてソートを実行してください。
// @author       Your Name
// @match        *://music.youtube.com/search*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = { minAlbumsToSort: 2, scrollPages: 9 }; // ソート対象最小数、スクロールページ数（約 400 曲分）
    let sortOrder = 'DESC'; // DESC=降順（新しい順）、ASC=昇順（古い順）
    let isSorted = false;
    
    // ログ出力用のタイマー管理
    let startTime = null;
    let albumAnalysisStartTime = null;
    let sortTriggerTime = null;

    // リリース年キャッシュ（同じ要素を何度も解析しないため）
    const yearCache = new Map();

    function addStyles() {
        if (document.querySelector('#yms-styles')) return;
        const style = document.createElement('style');
        style.id = 'yms-styles';
        style.textContent = '.ymsort-button{background:#212121;color:#fff;border:none;padding:12px 16px;font-size:14px;cursor:pointer;margin-bottom:8px;border-radius:8px}.ymsort-button:hover{background:#383838}.album-data-button{background:#212121;color:#fff;border:none;padding:12px 16px;font-size:14px;cursor:pointer;margin-bottom:8px;border-radius:8px}.album-data-button:hover{background:#383838}';
        document.head.appendChild(style);
    }

    // ログ出力ヘルパー関数
    function log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [YouTube Music Sorter]`;
        
        switch (level) {
            case 'error':
                console.error(prefix + ' ERROR: ' + message);
                break;
            case 'warn':
                console.warn(prefix + ' WARN: ' + message);
                break;
            default:
                console.log(prefix + ' ' + message);
        }
    }

    // 「アルバムデータの取得」ボタンを作成する関数
    function createAlbumDataButton() {
        log('「アルバムデータの取得」ボタンの作成を開始します');
        
        const existing = document.querySelector('.album-data-button');
        if (existing) {
            log('既存の「アルバムデータの取得」ボタンが存在するため、作成しない', 'warn');
            return; // 既存のボタンがある場合は作成しない
        }
        
        const button = document.createElement('button');
        button.className = 'album-data-button';
        button.textContent = '📥 アルバムデータの取得';
        
        button.addEventListener('click', () => {
            log('[AlbumDataButton] クリックされました、データ取得を開始します');
            button.textContent = '⏳アルバムデータの取得中(...)';
            // スクロールダウン（約 400 曲分）

            let scrollCount = 0;
            const maxScrolls = 10; // 10回で停止
            const intervalTime = 2000; // 2秒おき

            const scrollInterval = setInterval(() => {
                // ページの最下部へスクロール
                window.scrollTo(0, document.body.scrollHeight);
                scrollCount++;
                log(`[albumDataButton]スクロール中... (${scrollCount}/${maxScrolls})`);

                if (scrollCount >= maxScrolls) {
                    clearInterval(scrollInterval);
                    log("[albumDataButton]読み込み完了。最上部に戻ります...");

                    // 一番上（Homeボタンと同じ位置）に戻る
                    window.scrollTo({
                        top: 0,
                        behavior: 'smooth' // スルッと滑らかに戻る（一瞬で戻したい場合はこの行を消す）
                    });
                    button.textContent = '✅アルバムデータの取得';
                }
            }, intervalTime);
            
            // const scrollAmount = window.innerHeight * CONFIG.scrollPages;
            // log(`[AlbumDataButton] ${scrollAmount}px スクロールします`);
            // window.scrollBy(0, scrollAmount);
            
            // DOM の安定を待ってソートを実行
            // waitForDomStabilization(() => {
            //     log('[AlbumDataButton] DOM が安定しました、ソートを開始します');
            //     performSort();
            // });
        });
        
        const searchContainer = document.querySelector('ytmusic-nav-bar') || 
                                document.querySelector('#content') ||
                                document.body;
        if (searchContainer) {
            log(`[AlbumDataButton] ${searchContainer.tagName} にボタンを追加します`);
            // 既存のソートボタンの後に追加（または最初の要素の後）
            const sortBtn = document.querySelector('.ymsort-button');
            if (sortBtn && sortBtn.parentNode === searchContainer) {
                log('[AlbumDataButton] ソートボタンの後 に挿入します');
                searchContainer.insertBefore(button, sortBtn.nextSibling);
            } else {
                log('[AlbumDataButton] 最初の要素の後に挿入します');
                searchContainer.insertBefore(button, searchContainer.firstChild);
            }
        } else {
            log('警告：[AlbumDataButton] ボタンの親要素が見つかりません', 'warn');
        }
        
        log('[AlbumDataButton] ボタン作成完了');
    }

    function createSortButton() {
        log('ソートボタンの作成を開始します');
        
        const existing = document.querySelector('.ymsort-button');
        if (existing) {
            log('既存のソートボタンを削除します');
            existing.remove();
        }
        
        addStyles();
        const button = document.createElement('button');
        button.className = 'ymsort-button';
        
        if (isSorted) {
            button.textContent = sortOrder === 'DESC' 
                ? '▼ 年代順にソート（降順）' 
                : '▲ 年代順にソート（昇順）';
        } else {
            button.textContent = '▶ 年代順にソートする';
        }
        
        // イベントリスナーを再設定（重要：このボタンクリックでソートが実行される）
        button.addEventListener('click', toggleSortOrder);
        
        const searchContainer = document.querySelector('ytmusic-nav-bar') || 
                                document.querySelector('#content') ||
                                document.body;
        if (searchContainer) {
            log(`ソートボタンを ${searchContainer.tagName} に追加します`);
            searchContainer.insertBefore(button, searchContainer.firstChild);
        } else {
            log('警告：ソートボタンの親要素が見つかりません', 'warn');
        }
        
        log('ソートボタン作成完了');
        return button;
    }

    function extractReleaseYear(element) {
        // キャッシュから取得（同じ要素を何度も解析しないため）
        if (yearCache.has(element)) {
            const cached = yearCache.get(element);
            // log(`キャッシュから年 ${cached} を取得しました`); // logが多すぎるのでコメントアウト
            return cached;
        }

        log('リリース年抽出処理を開始します');
        
        const extractYearFromText = texts => {
            for (const text of texts) {
                // リリース年パターン：YYYY 年 または YYYY 年（スペースあり/なし両対応）
                // \d は ASCII の数字のみなので、全角の「年」にも対応するために explicit に指定
                const match = text.match(/(\d{4})(?:\s*[\u5E74])?/);
                if (match) {
                    log(`テキスト "${text}" から年 ${match[1]} を抽出しました`);
                    return parseInt(match[1], 10);
                }
            }
            return null;
        };

        // エスケープされた JSON をデコード（&quot; → "）
        const decodeJson = attr => {
            if (!attr) return null;
            try {
                return JSON.parse(attr.replace(/&quot;/g, '"'));
            } catch (e) {
                log(`JSON パースエラー：${e.message}`, 'warn');
                return null;
            }
        };

        // flex-columns（新 UI）を優先して試す
        const flexColumnsAttr = element.getAttribute('flex-columns');
        if (flexColumnsAttr) {
            log('flex-columns 属性が見つかりました、解析します');
            const flexColumns = decodeJson(flexColumnsAttr);
            if (flexColumns && Array.isArray(flexColumns)) {
                log(`flex-columns から ${flexColumns.length} カラムを取得しました`);
                // flex_columns[0] に詳細情報（リリース年を含む）がある場合が多い
                for (let i = 0; i < flexColumns.length; i++) {
                    const col = flexColumns[i];
                    if (col.text?.runs) {
                        log(`カラム ${i} のテキスト runs を解析します`);
                        const year = extractYearFromText(col.text.runs.map(r => r.text));
                        if (year !== null) {
                            log(`flex-columns から年 ${year} を抽出しました`);
                            yearCache.set(element, year);
                            return year;
                        }
                    }
                }
            } else {
                log('flex-columns が配列ではありません', 'warn');
            }
        } else {
            log('flex-columns 属性が見つかりませんでした');
        }
        
        // secondary-flex-columns（旧 UI）を試す
        const secFlexColumnsAttr = element.getAttribute('secondary-flex-columns');
        if (secFlexColumnsAttr) {
            log('secondary-flex-columns 属性が見つかりました、解析します');
            const data = decodeJson(secFlexColumnsAttr);
            if (data && Array.isArray(data)) {
                log(`secondary-flex-columns から ${data.length} 項目を取得しました`);
                for (const item of data) {
                    if (item.text?.runs) {
                        const year = extractYearFromText(item.text.runs.map(r => r.text));
                        if (year !== null) {
                            log(`secondary-flex-columns から年 ${year} を抽出しました`);
                            yearCache.set(element, year);
                            return year;
                        }
                    }
                }
            } else {
                log('secondary-flex-columns が配列ではありません', 'warn');
            }
        } else {
            log('secondary-flex-columns 属性が見つかりませんでした');
        }
        
        log('リリース年抽出に失敗しました（null を返します）');
        yearCache.set(element, null);
        return null;
    }

    function performSort() {
        log('[performSort()] ソート処理を開始します');
        
        const section = document.querySelector('ytmusic-shelf-renderer');
        if (!section) {
            log('アルバムセクションが見つかりません、ソートしない', 'error');
            return false;
        }
        
        const items = Array.from(section.querySelectorAll('ytmusic-responsive-list-item-renderer'));
        log(`見つかったアルバム要素数：${items.length}`);
        
        if (items.length < CONFIG.minAlbumsToSort) {
            log(`アルバム数が ${CONFIG.minAlbumsToSort} 未満 (${items.length})、ソートしない`, 'warn');
            return false;
        }
        
        // リリース年抽出のデバッグ
        const yearData = items.map(item => {
            const year = extractReleaseYear(item);
            const titleEl = item.querySelector('.title');
            const titleText = titleEl ? titleEl.textContent.trim() : 'タイトルなし';
            return { year, title: titleText };
        });
        
        log(`リリース年抽出結果（${yearData.length}件）:`);
        yearData.forEach((data, i) => {
            log(`  [${i+1}] ${data.year ? data.year : 'N/A'} - ${data.title}`);
        });
        
        // ソート実行
        log('[performSort(){items.sort()}] ソート処理を実行します');
        items.sort((a, b) => {
            const yearA = extractReleaseYear(a);
            const yearB = extractReleaseYear(b);
            
            if (yearA === null && yearB === null) return 0;
            if (yearA === null) return 1;
            if (yearB === null) return -1;
            
            return sortOrder === 'DESC' ? yearB - yearA : yearA - yearB;
        });
        
        // DOM 更新
        const fragment = document.createDocumentFragment();
        items.forEach(item => fragment.appendChild(item));
        
        const children = Array.from(section.children);
        children.forEach(child => {
            if (child.tagName === 'YTMUSIC-RESPONSIVE-LIST-ITEM-RENDERER') {
                section.removeChild(child);
            }
        });
        
        section.appendChild(fragment);
        log(`ソート完了（${items.length}件）`);
        return true;
    }

    // DOM 更新完了後にソートを実行するための待機関数
    function waitForDomStabilization(callback) {
        const section = document.querySelector('ytmusic-shelf-renderer');
        log('[waitForDomStabilization]DOMの安定を待ちます');
        if (!section) return;

        let mutationCount = 0;
        const maxMutations = 10; // 最大 10 回の Mutation は許容
        
        const observer = new MutationObserver(mutations => {
            mutationCount++;
            
            // DOM 更新が安定したと判断したらソートを実行
            if (mutationCount >= 3) {
                observer.disconnect();
                log(`DOM が ${mutationCount} 回更新され、安定しました。ソート開始`);
                callback();
            }
        });

        // リストアイテムの変化を監視
        observer.observe(section, { 
            childList: true, 
            subtree: true 
        });

        // タイムアウト fallback（3 秒後に必ず実行）
        setTimeout(() => {
            observer.disconnect();
            log('DOM 待機タイムアウト、ソート開始');
            callback();
        }, 3000);
    }

    function toggleSortOrder() {
        log('ソート順序を切り替えます');
        sortOrder = (sortOrder === 'DESC') ? 'ASC' : 'DESC';
        isSorted = true;
        sortTriggerTime = new Date();
        yearCache.clear();  // ソート順序切り替え時にキャッシュをクリア
        log('ソート順序切り替えにより、年抽出キャッシュをクリアしました');
        log(`新しいソート順序：${sortOrder}`);
        log(`ソートトリガー時刻：${sortTriggerTime.toISOString()}`);
        createSortButton();
        
        // DOM の更新完了を待ってからソートを実行
        waitForDomStabilization(() => {
            performSort();
        });
    }

    function main() {
        log('[main]メイン処理を開始します');
        startTime = new Date();
        log(`[main]処理開始時刻：${startTime.toISOString()}`);
        
        // アルバムセクションの存在を確認
        const section = document.querySelector('ytmusic-shelf-renderer');
        if (section) {
            albumAnalysisStartTime = new Date();
            log(`[main]アルバム分析開始時刻：${albumAnalysisStartTime.toISOString()}`);
            
            const items = Array.from(section.querySelectorAll('ytmusic-responsive-list-item-renderer'));
            log(`[main]アルバムセクションを把握しました。総数：${items.length}件`);
        } else {
            log('[main]警告：アルバムセクションが見つかりません', 'warn');
        }
        
        // DOM 準備完了を待つ
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                log('[main]DOMContentLoaded イベント発火');
                setTimeout(() => {
                    createSortButton();
                    createAlbumDataButton(); // 新しいボタンも作成
                }, 500);
            });
        } else {
            setTimeout(() => {
                createSortButton();
                createAlbumDataButton(); // 新しいボタンも作成
            }, 500);
        }
    }

    if (location.hostname.includes('music.youtube.com') && location.pathname === '/search') {
        main();
    }
})();