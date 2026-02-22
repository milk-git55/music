// ===============================
// 0. 全局样式注入
// ===============================
(function() {
  const style = document.createElement('style');
  style.innerHTML = `
    .page-loading {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(255, 255, 255, 0.9); display: flex;
      justify-content: center; align-items: center; z-index: 9999;
      opacity: 1; transition: opacity 0.5s ease;
    }
    .loading-spinner {
      width: 50px; height: 50px; border: 5px solid #e0e0e0;
      border-top: 5px solid #1ec8e7; border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    body.dark-mode .page-loading { background: rgba(0, 0, 0, 0.85); }
    body.dark-mode .loading-spinner { border-color: #333; border-top-color: #1ec8e7; }
  `;
  document.head.appendChild(style);
})();

// ===============================
// 1. 基础配置
// ===============================
const API_BASE = 'https://music-api.gdstudio.xyz/api.php';
const QQ_API_BASE = 'http://localhost:3200'; // 您的QQ音乐API基础地址
const RANK_API = 'https://60s.viki.moe/v2/ncm-rank/list';
const DEFAULT_SOURCE = 'joox';
const SEARCH_COUNT = 20;

let apiCallCount = 0;
let lastApiCallTime = Date.now();
const MAX_CALLS_PER_5MINUTES = 45; 

// ===============================
// 2. 工具函数
// ===============================
function checkApiLimit() {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  if (now - lastApiCallTime > fiveMinutes) {
    apiCallCount = 0;
    lastApiCallTime = now;
  }
  if (apiCallCount >= MAX_CALLS_PER_5MINUTES) {
    const waitTime = Math.ceil((fiveMinutes - (now - lastApiCallTime)) / 1000);
    throw new Error(`API调用频率过高，请等待${waitTime}秒后再试`);
  }
  apiCallCount++;
}

async function fetchApi(params) {
  try {
    checkApiLimit();
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE}?${queryString}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('API请求失败:', error);
    throw error;
  }
}

// ===============================
// 3. 新增：QQ音乐封面获取函数（核心逻辑）
// ===============================

/**
 * 根据关键词搜索歌曲并获取专辑MID
 * @param {string} keyword 歌名+歌手，如 "周杰伦 晴天"
 * @returns {Promise<string|null>} 专辑MID 或 null
 */
async function searchSongForCover(keyword) {
  try {
    const url = `${QQ_API_BASE}/getSearchByKey?key=${encodeURIComponent(keyword)}`;
    const res = await fetch(url);
    const json = await res.json();
    
    // 按您给的返回结构提取 albummid
    const albumMid = json?.response?.data?.song?.list?.[0]?.albummid;
    return albumMid || null;
  } catch (error) {
    console.error('搜索歌曲封面失败:', error);
    return null;
  }
}

/**
 * 根据专辑MID获取图片URL
 * @param {string} albumMid 专辑MID
 * @param {number} size 图片尺寸 (300, 500, 800)
 * @returns {Promise<string|null>} 图片URL 或 null
 */
async function getImageUrlByMid(albumMid, size = 300) {
  if (!albumMid) return null;
  try {
    const url = `${QQ_API_BASE}/getImageUrl?id=${albumMid}`;
    const res = await fetch(url);
    const json = await res.json();
    
    // 提取 imageUrl
    let imageUrl = json?.response?.data?.imageUrl;
    if (!imageUrl) return null;
    
    // 替换尺寸
    imageUrl = imageUrl.replace(/T002R\d+x\d+/, `T002R${size}x${size}`);
    return imageUrl;
  } catch (error) {
    console.error('获取图片URL失败:', error);
    return null;
  }
}

/**
 * 获取歌曲封面（封装后方便调用）
 * @param {string} songTitle 歌名
 * @param {string} songArtist 歌手
 * @param {number} size 图片尺寸
 * @returns {Promise<string>} 图片URL，失败时返回默认图
 */
async function getMusicCover(songTitle, songArtist, size = 300) {
  const keyword = `${songTitle} ${songArtist}`;
  const albumMid = await searchSongForCover(keyword);
  if (!albumMid) return '../img/default.png'; // 未找到专辑ID
  
  const coverUrl = await getImageUrlByMid(albumMid, size);
  return coverUrl || '../img/default.png';
}

// 暴露给全局作用域，方便在事件绑定中调用
window.getMusicCover = getMusicCover;

// ===============================
// 4. 页面初始化
// ===============================
document.addEventListener('DOMContentLoaded', function() {
  // 1. 加载动画控制
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'page-loading';
  loadingDiv.innerHTML = '<div class="loading-spinner"></div>';
  document.body.appendChild(loadingDiv);
  
  window.addEventListener('load', () => {
    setTimeout(() => {
      loadingDiv.style.opacity = '0';
      setTimeout(() => loadingDiv.remove(), 500);
    }, 300);
  });
  
  // 2. 绑定搜索事件
  try {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    
    if (searchInput && searchBtn) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const keyword = searchInput.value.trim();
          if (keyword) performSearch(keyword);
          else showRankings();
        }
      });
      
      searchBtn.addEventListener('click', () => {
        const keyword = searchInput.value.trim();
        if (keyword) performSearch(keyword);
        else showRankings();
      });
    }
  } catch (e) { console.error('初始化搜索失败', e); }

  if (document.getElementById('rankings-container')) initializeRankings();
  if (document.getElementById('favorites-list')) renderFavorites();
  
  // 3. 初始化播放页专辑图 (最高优先级)
  initializePlayerCover();
});

// ===============================
// 5. 原有封面获取函数（已替换为QQ API）
// ===============================

async function initializePlayerCover() {
  const coverImg = document.getElementById('cover') || document.querySelector('.album-cover img');
  if (!coverImg) return;
  
  const urlParams = new URLSearchParams(window.location.search);
  const title = urlParams.get('title') || '';
  const artist = urlParams.get('artist') || '';
  
  console.log('使用QQ API初始化专辑图:', { title, artist });
  
  // 设置加载占位图
  coverImg.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7mraPluLjlhoXlrrk8L3RleHQ+PC9zdmc+';

  // 调用新的QQ API封装函数
  const finalUrl = await getMusicCover(title, artist, 300);
  coverImg.src = finalUrl;
}

// ===============================
// 6. 业务逻辑函数（修改：搜索结果带图片）
// ===============================

async function searchMusic(keyword, source = DEFAULT_SOURCE, page = 1) {
  const data = await fetchApi({
    types: 'search',
    source: source,
    name: keyword,
    count: SEARCH_COUNT,
    pages: page
  });
  if (!Array.isArray(data)) return [];
  return data.map(item => ({
    id: item.id,
    title: item.name,
    artist: item.artist.join(', '),
    album: item.album,
    picId: item.pic_id,
    lyricId: item.lyric_id,
    source: item.source
  }));
}

function showRankings() {
  const rankingsSection = document.getElementById('rankings-section');
  const musicList = document.getElementById('music-list');
  const resultDiv = document.getElementById('search-result');
  if (rankingsSection) rankingsSection.style.display = 'block';
  if (musicList) musicList.innerHTML = '';
  if (resultDiv) resultDiv.style.display = 'none';
}

async function performSearch(keyword) {
  if (!keyword) return;
  const rankingsSection = document.getElementById('rankings-section');
  if (rankingsSection) rankingsSection.style.display = 'none';
  
  const musicListEl = document.getElementById('music-list');
  const loadingEl = document.getElementById('loading');
  if (!musicListEl) return;

  musicListEl.innerHTML = '';
  if (loadingEl) loadingEl.style.display = 'block';
  showSearchResult(0, `正在搜索 "${keyword}"...`);
  
  try {
    const songs = await searchMusic(keyword, DEFAULT_SOURCE);
    renderMusicList(songs);
    showSearchResult(songs.length, keyword);
  } catch (error) {
    musicListEl.innerHTML = `<div style="text-align: center; width: 100%; padding: 40px; color: #ff6b6b;"><p>搜索出错：${error.message}</p></div>`;
    showSearchResult(0, '搜索失败');
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

async function renderMusicList(songs) {
  const musicListEl = document.getElementById('music-list');
  if (!musicListEl) return;
  
  if (songs.length === 0) {
    musicListEl.innerHTML = '<div style="text-align: center; width: 100%; padding: 40px; color: #6c757d;"><p>没有找到相关歌曲</p></div>';
    return;
  }
  
  // 先渲染卡片结构（不含图片）
  musicListEl.innerHTML = songs.map((song, index) => {
    const safeTitle = song.title.replace(/'/g, "\\'");
    const safeArtist = song.artist.replace(/'/g, "\\'");
    const isFav = isFavorited(song.id);

    return `
      <div class="music-card" data-index="${index}">
        <div class="music-card-cover-container">
            <img class="music-card-cover" data-title="${safeTitle}" data-artist="${safeArtist}" src="../img/default.png" alt="封面">
        </div>
        <button class="btn favorite-btn ${isFav ? 'favorited' : ''}" 
                onclick="toggleFavorite('${song.id}', '${safeTitle}', '${safeArtist}', '${song.source}')" 
                title="${isFav ? '取消收藏' : '收藏'}">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        <div class="music-info">
          <div class="music-title">${song.title}</div>
          <div class="music-artist">${song.artist}</div>
        </div>
        <div class="music-actions">
          <button class="btn" onclick="playSong('${song.id}', '${song.source}', '${safeTitle}', '${safeArtist}', '${song.picId}')">播放</button>
          <button class="btn" onclick="downloadSong('${song.id}', '${song.source}')">下载</button>
        </div>
      </div>
    `;
  }).join('');

  // 异步加载封面图片
  const coverElements = document.querySelectorAll('.music-card-cover');
  coverElements.forEach(async (img) => {
    const title = img.getAttribute('data-title');
    const artist = img.getAttribute('data-artist');
    try {
      const coverUrl = await window.getMusicCover(title, artist, 150); // 搜索结果用小图
      if (coverUrl) {
        img.src = coverUrl;
      }
    } catch (e) {
      console.error(`为歌曲 "${title} - ${artist}" 获取封面失败`, e);
    }
  });
}

function playSong(id, source, title, artist, picId) {
  const params = new URLSearchParams({ id, source, title, artist, picId: picId || '' });
  window.location.href = `template/player.html?${params.toString()}`;
}

async function getMusicUrl(id, source, br = 320) {
  const data = await fetchApi({ types: 'url', source, id, br });
  return data.url || null;
}

async function downloadSong(id, source) {
  try {
    const url = await getMusicUrl(id, source);
    if (!url) return alert('无法获取下载链接');
    window.open(url, '_blank');
  } catch (error) {
    alert('下载失败: ' + error.message);
  }
}

function showSearchResult(count, keyword) {
  let resultDiv = document.getElementById('search-result');
  if (!resultDiv) {
    resultDiv = document.createElement('div');
    resultDiv.id = 'search-result';
    resultDiv.style.cssText = 'text-align: center; margin: 10px 0; color: #3a8dde; font-size: 14px;';
    const contentArea = document.querySelector('.content-area');
    const musicList = document.getElementById('music-list');
    if (contentArea && musicList) contentArea.insertBefore(resultDiv, musicList);
  }
  resultDiv.textContent = keyword ? `${keyword} - 共 ${count} 首` : '';
  resultDiv.style.display = 'block';
}

// ===============================
// 7. 排行榜功能（无修改）
// ===============================
async function initializeRankings() {
  const rankingsContainer = document.getElementById('rankings-container');
  if (!rankingsContainer) return;
  
  try {
    const response = await fetch(RANK_API);
    const data = await response.json();
    if (data.code === 200 && data.data && data.data.length > 0) {
      const displayRankings = data.data.slice(0, 12);
      rankingsContainer.innerHTML = displayRankings.map(ranking => `
        <div class="ranking-card" title="${ranking.name} (仅展示)">
          <img class="ranking-cover" src="${ranking.cover}" alt="${ranking.name}" onerror="this.src='../img/default.png'">
          <div class="ranking-info">
            <div class="ranking-name">${ranking.name}</div>
            <div class="ranking-description">${ranking.description}</div>
            <div class="ranking-update">
              <span class="update-frequency">${ranking.update_frequency}</span>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      rankingsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:20px; color:#6c757d;">暂无排行榜数据</div>';
    }
  } catch (error) {
    console.error('排行榜加载失败:', error);
    rankingsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:20px; color:#6c757d;">排行榜加载失败</div>';
  }
}

// ===============================
// 8. 收藏功能（无修改）
// ===============================
function getFavorites() { return JSON.parse(localStorage.getItem('musicFavorites') || '[]'); }
function saveFavorites(favorites) { localStorage.setItem('musicFavorites', JSON.stringify(favorites)); }

function toggleFavorite(id, title, artist, source) {
  const favorites = getFavorites();
  const index = favorites.findIndex(f => f.id === id && f.source === source);
  if (index > -1) favorites.splice(index, 1);
  else favorites.push({ id, title, artist, source });
  saveFavorites(favorites);
  renderFavorites();
  const btn = document.querySelector(`.music-card .favorite-btn[onclick*="'${id}'"]`);
  if (btn) {
    btn.classList.toggle('favorited');
    btn.title = index > -1 ? '收藏' : '取消收藏';
  }
}

function isFavorited(id) { return getFavorites().some(f => f.id === id); }

function renderFavorites() {
  const favoritesList = document.getElementById('fans-list');
  if (!favoritesList) return;
  const favorites = getFavorites();
  if (favorites.length === 0) {
    favoritesList.innerHTML = '<div class="favorites-empty"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><p>还没有收藏</p></div>';
    return;
  }
  favoritesList.innerHTML = favorites.map(item => `
    <div class="favorite-item" onclick="playSong('${item.id}', '${item.source}', '${item.title}', '${item.artist}', '')">
      <div class="favorite-item-title">${item.title}</div>
      <div class="favorite-item-artist">${item.artist}</div>
      <div class="favorite-item-actions">
        <button class="btn" onclick="event.stopPropagation(); playSong('${item.id}', '${item.source}')">播放</button>
        <button class="btn remove-btn" onclick="event.stopPropagation(); toggleFavorite('${item.id}', '', '', '${item.source}')" title="取消收藏">×</button>
      </div>
    </div>
  `).join('');
}

function exportFavorites() {
  const favorites = getFavorites();
  const blob = new Blob([JSON.stringify(favorites, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `music_favorites.json`;
  a.click();
}

function importFavorites(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data)) { saveFavorites(data); renderFavorites(); alert('导入成功'); }
    } catch (err) { alert('导入失败'); }
  };
  reader.readAsText(file);
}

function clearFavorites() { if (confirm('确定清空收藏？')) { saveFavorites([]); renderFavorites(); } }
