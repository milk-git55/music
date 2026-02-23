// 播放器逻辑

const API_BASE = 'https://music-api.gdstudio.xyz/api.php';
const QQ_API_BASE = 'https://api.wuhy.de5.net'; // 您的QQ音乐API基础地址

// API 封装
async function fetchApi(params) {
  const queryString = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}?${queryString}`);
  if (!response.ok) throw new Error('API请求失败');
  return response.json();
}

async function getMusicUrl(id, source) {
  const data = await fetchApi({ types: 'url', source, id, br: 320 });
  return data.url || null;
}

async function getLyric(id, source) {
  const data = await fetchApi({ types: 'lyric', source, id });
  return data.lyric || '';
}

// ================== QQ音乐封面获取逻辑 ==================

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
async function getSongCoverUrl(songTitle, songArtist, size = 300) {
  const keyword = `${songTitle} ${songArtist}`;
  const albumMid = await searchSongForCover(keyword);
  if (!albumMid) return '../img/default.png'; // 未找到专辑ID
  
  const coverUrl = await getImageUrlByMid(albumMid, size);
  return coverUrl || '../img/default.png';
}

// ================== 核心逻辑开始 ==================

document.addEventListener('DOMContentLoaded', () => {
  initPlayer();
});

async function initPlayer() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const source = params.get('source');
  const title = params.get('title') || '未知歌曲';
  const artist = params.get('artist') || '未知歌手';
  const picId = params.get('picId'); // 保留原有参数，但不再用于封面获取

  const titleEl = document.getElementById('player-title');
  const artistEl = document.getElementById('player-artist');
  const coverEl = document.getElementById('player-cover');
  const audioEl = document.getElementById('player-audio');
  const lyricsContainer = document.getElementById('lyrics-container');

  if (!titleEl || !audioEl) {
    console.error('播放器关键元素未找到');
    return;
  }

  titleEl.textContent = decodeURIComponent(title);
  if (artistEl) artistEl.textContent = decodeURIComponent(artist);
  if (lyricsContainer) lyricsContainer.innerHTML = '<p class="lyrics-line">歌词加载中...</p>';

  if (!id || !source) {
    titleEl.textContent = '参数错误';
    titleEl.style.color = '#ff6b6b';
    return;
  }

  try {
    // 1. 获取播放链接
    const playUrl = await getMusicUrl(id, source);
    if (playUrl) {
      audioEl.src = playUrl;
    } else {
      throw new Error('无法获取播放链接');
    }

    // 2. 获取封面 (使用新的QQ API逻辑)
    if (coverEl) {
        // 直接调用新的函数，根据歌名和歌手获取封面
        const picUrl = await getSongCoverUrl(title, artist, 300);
        coverEl.src = picUrl;
    }

    // 3. 获取歌词
    if (lyricsContainer) {
        const lyricText = await getLyric(id, source);
        if (lyricText) {
          parseLyrics(lyricText);
        } else {
          lyricsContainer.innerHTML = '<p class="lyrics-line">暂无歌词</p>';
        }
    }

  } catch (error) {
    console.error(error);
    titleEl.textContent = '加载失败';
    titleEl.style.color = '#ff6b6b';
    if (lyricsContainer) {
        lyricsContainer.innerHTML = '<p class="lyrics-line">歌曲加载失败</p>';
    }
  }

  initControls();
}

// 歌词解析
let lyrics = [];
let currentLyricIndex = -1;

function parseLyrics(text) {
  const lines = text.split('\n');
  const result = [];
  const timeTag = /\[(\d{2}):(\d{2})(?:[\.:](\d{1,3}))?\]/g;

  for (const line of lines) {
    let tags = [...line.matchAll(timeTag)];
    let lyricText = line.replace(timeTag, '').trim();
    for (const tag of tags) {
      const min = parseInt(tag[1], 10);
      const sec = parseInt(tag[2], 10);
      const ms = tag[3] ? parseInt(tag[3].padEnd(3, '0'), 10) : 0;
      result.push({ time: min * 60 + sec + ms / 1000, text: lyricText });
    }
  }
  
  lyrics = result.filter(l => l.text).sort((a, b) => a.time - b.time);
  renderLyrics();
}

function renderLyrics() {
  const container = document.getElementById('lyrics-container');
  if (!container) return;
  container.innerHTML = lyrics.map((l, i) => `<p class="lyrics-line" data-index="${i}">${l.text}</p>`).join('');
}

function updateLyrics(currentTime) {
  if (!lyrics.length) return;
  
  let newIndex = -1;
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (lyrics[i].time <= currentTime) {
      newIndex = i;
      break;
    }
  }

  if (newIndex !== currentLyricIndex) {
    currentLyricIndex = newIndex;
    
    document.querySelectorAll('.lyrics-line.active').forEach(el => el.classList.remove('active'));
    
    const activeLine = document.querySelector(`[data-index="${newIndex}"]`);
    if (activeLine) {
      activeLine.classList.add('active');
      const container = document.getElementById('lyrics-container');
      if (container) {
        const scrollTarget = activeLine.offsetTop - container.clientHeight / 2 + activeLine.clientHeight / 2;
        container.scrollTop = scrollTarget;
      }
    }
  }
}

function initControls() {
  const audio = document.getElementById('player-audio');
  const playBtn = document.getElementById('play-btn');
  
  // 修复：正确获取 play-icon
  const playIcon = document.getElementById('play-icon'); 
  const pauseIcon = document.getElementById('pause-icon');
  
  const progress = document.getElementById('player-progress');
  const cover = document.getElementById('player-cover');

  if (!audio || !playBtn) return;

  playBtn.addEventListener('click', () => {
    if (audio.paused) audio.play();
    else audio.pause();
  });

  audio.addEventListener('play', () => {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
    cover.classList.add('rotating'); // 添加旋转动画
  });

  audio.addEventListener('pause', () => {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    cover.classList.remove('rotating'); // 移除旋转动画
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      progress.value = (audio.currentTime / audio.duration) * 100;
    }
    updateLyrics(audio.currentTime);
  });

  progress.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (progress.value / 100) * audio.duration;
    }
  });
  
  audio.addEventListener('error', () => {
    const titleEl = document.getElementById('player-title');
    if (titleEl) {
      titleEl.textContent = '播放出错';
      titleEl.style.color = '#ff6b6b';
    }
  });
}
