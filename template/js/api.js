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
const KUWO_API_BASE = 'https://oiapi.net/api/Kuwo';
const RANK_API = 'https://60s.viki.moe/v2/ncm-rank/list';
const SEARCH_LIMIT = 20;
const DEFAULT_BR = 1; // 默认音质：1=无损，2=高品质，3=标准，可根据需求调整

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

async function fetchKuwoApi(params) {
  try {
    checkApiLimit();
    const queryString = new URLSearchParams(params).toString();
    const url = `${KUWO_API_BASE}?${queryString}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('酷我API请求失败:', error);
    throw error;
  }
}

// ===============================
// 3. 搜索音乐（返回列表）
// ===============================
async function searchMusic(keyword, page = 1, limit = SEARCH_LIMIT, br = DEFAULT_BR) {
  try {
    const data = await fetchKuwoApi({
      msg: keyword,
      page: page,
      limit: limit,
      br: br
    });
    
    if (data.code !== 1 || !data.data || !Array.isArray(data.data)) {
      console.warn('API返回数据格式异常:', data);
      return [];
    }

    return data.data.map(item => ({
      id: item.rid,
      title: item.song || '未知歌曲',
      artist: item.singer || '未知歌手',
      album: item.album || '',
      picId: item.picture || '',
      source: 'kuwo',
      types: item.types || [],
      url: item.url || null
    }));
  } catch (error) {
    console.error('搜索失败:', error);
    return [];
  }
}

// ===============================
// 4. 获取播放链接（使用 msg + n=1 + br）
// ===============================
async function getMusicUrlByTitle(title, br = DEFAULT_BR) {
  try {
    const data = await fetchKuwoApi({
      msg: title,
      n: 1,
      br: br
    });
    
    // 注意：当使用 n=1 时，返回的 data.data 是一个对象，不是数组
    if (data.code === 1 && data.data && data.data.url) {
      return data.data.url;
    }
    return null;
  } catch (error) {
    console.error('通过标题获取播放链接失败:', error);
    return null;
  }
}

// ===============================
// 5. 下载歌曲（需要标题）
// ===============================
async function downloadSong(id, title) {
  try {
    const url = await getMusicUrlByTitle(title);
    if (!url) return alert('无法获取下载链接');
    window.open(url, '_blank');
  } catch (error) {
    alert('下载失败: ' + error.message);
  }
}

// ===============================
// 6. 歌词（酷我 API 暂不支持）
// ===============================
async function getLyric(id, source) {
  return '';
}

// ===============================
// 7. 播放歌曲（跳转播放器，传递 title 作为关键参数）
// ===============================
function playSong(id, source, title, artist, picId) {
  const params = new URLSearchParams({ 
    id, 
    source, 
    title, 
    artist, 
    picId: picId || ''
  });
  window.location.href = `template/player.html?${params.toString()}`;
}

// ===============================
// 8. 页面初始化
// ===============================
document.addEventListener('DOMContentLoaded', function() {
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
});

// ===============================
// 9. 搜索执行与渲染
// ===============================
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
    const songs = await searchMusic(keyword);
    renderMusicList(songs);
    showSearchResult(songs.length, keyword);
  } catch (error) {
    musicListEl.innerHTML = `<div style="text-align: center; width: 100%; padding: 40px; color: #ff6b6b;"><p>搜索出错：${error.message}</p></div>`;
    showSearchResult(0, '搜索失败');
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function renderMusicList(songs) {
  const musicListEl = document.getElementById('music-list');
  if (!musicListEl) return;
  
  if (songs.length === 0) {
    musicListEl.innerHTML = '<div style="text-align: center; width: 100%; padding: 40px; color: #6c757d;"><p>没有找到相关歌曲</p></div>';
    return;
  }
  
  musicListEl.innerHTML = songs.map((song, index) => {
    const safeTitle = song.title.replace(/'/g, "\\'");
    const safeArtist = song.artist.replace(/'/g, "\\'");
    const isFav = isFavorited(song.id);

    return `
      <div class="music-card" data-index="${index}">
        <div class="music-card-cover-container">
            <img class="music-card-cover" src="${song.picId || '../img/default.png'}" alt="封面" onerror="this.src='../img/default.png'">
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
          <button class="btn" onclick="downloadSong('${song.id}', '${safeTitle}')">下载</button>
        </div>
      </div>
    `;
  }).join('');
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

function showRankings() {
  const rankingsSection = document.getElementById('rankings-section');
  const musicList = document.getElementById('music-list');
  const resultDiv = document.getElementById('search-result');
  if (rankingsSection) rankingsSection.style.display = 'block';
  if (musicList) musicList.innerHTML = '';
  if (resultDiv) resultDiv.style.display = 'none';
}

// ===============================
// 10. 排行榜功能
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
// 11. 收藏功能
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
  const favoritesList = document.getElementById('favorites-list'); // 根据实际ID调整
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
        <button class="btn" onclick="event.stopPropagation(); playSong('${item.id}', '${item.source}', '${item.title}', '${item.artist}', '')">播放</button>
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