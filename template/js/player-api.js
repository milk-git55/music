// ===============================
// 播放器逻辑 - 酷我音频 + QQ音乐封面/歌词 + 音频代理
// ===============================

const KUWO_API_BASE = 'https://oiapi.net/api/Kuwo';
const QQMUSIC_API_BASE = 'https://api.wuhy.de5.net';
const AUDIO_PROXY_BASE = 'https://api.pulsic.dpdns.org/';
const DEFAULT_BR = 1; // 酷我音质：1=无损

// ---------- 酷我 API ----------
async function fetchKuwoApi(params) {
  const queryString = new URLSearchParams(params).toString();
  const response = await fetch(`${KUWO_API_BASE}?${queryString}`);
  if (!response.ok) throw new Error('酷我API请求失败');
  return response.json();
}

async function getMusicUrlByTitle(title, br = DEFAULT_BR) {
  try {
    const data = await fetchKuwoApi({ msg: title, n: 1, br });
    if (data.code === 1 && data.data && data.data.url) {
      return data.data.url; // 返回原始的 HTTP 链接
    }
    return null;
  } catch (error) {
    console.error('通过标题获取播放链接失败:', error);
    return null;
  }
}

// ---------- QQ音乐 API ----------
async function fetchQQMusicApi(endpoint, params) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${QQMUSIC_API_BASE}${endpoint}?${queryString}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('QQ音乐API请求失败');
  return response.json();
}

async function searchSongInfo(title, artist) {
  try {
    const keyword = `${title} ${artist}`;
    const data = await fetchQQMusicApi('/getSearchByKey', { key: keyword, limit: 1 });
    const songList = data?.response?.data?.song?.list;
    if (songList && songList.length > 0) {
      const firstSong = songList[0];
      return {
        songmid: firstSong.songmid,
        albummid: firstSong.albummid
      };
    }
    return null;
  } catch (error) {
    console.error('搜索歌曲信息失败:', error);
    return null;
  }
}

async function getLyricBySongmid(songmid) {
  if (!songmid) return '';
  try {
    const data = await fetchQQMusicApi('/getLyric', { songmid });
    return data?.response?.lyric || '';
  } catch (error) {
    console.error('获取歌词失败:', error);
    return '';
  }
}

async function getCoverUrlByAlbummid(albummid, size = 300) {
  if (!albummid) return null;
  try {
    const data = await fetchQQMusicApi('/getImageUrl', { id: albummid, size: `${size}x${size}` });
    return data?.response?.data?.imageUrl || null;
  } catch (error) {
    console.error('获取封面失败:', error);
    return null;
  }
}

// ---------- 播放器初始化 ----------
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('player-title')) return;
  initPlayer();
});

async function initPlayer() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const source = params.get('source') || 'kuwo';
  const title = params.get('title') || '未知歌曲';
  const artist = params.get('artist') || '未知歌手';
  const picId = params.get('picId');

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

  if (!title) {
    titleEl.textContent = '参数错误';
    titleEl.style.color = '#ff6b6b';
    return;
  }

  try {
    // 1. 获取播放链接（酷我）
    const playUrl = await getMusicUrlByTitle(title);
    if (playUrl) {
      // 仅音频使用代理
      const proxiedUrl = `${AUDIO_PROXY_BASE}?url=${encodeURIComponent(playUrl)}`;
      audioEl.src = proxiedUrl;
    } else {
      throw new Error('无法获取播放链接');
    }

    // 2. 搜索歌曲信息（复用，用于封面和歌词）
    const songInfo = await searchSongInfo(title, artist);

    // 3. 设置封面（优先使用 picId，否则通过 albummid 获取）
    if (coverEl) {
      if (picId && picId !== '') {
        coverEl.src = picId;
      } else if (songInfo && songInfo.albummid) {
        const coverUrl = await getCoverUrlByAlbummid(songInfo.albummid);
        coverEl.src = coverUrl || '../img/default.png';
      } else {
        coverEl.src = '../img/default.png';
      }
    }

    // 4. 获取歌词
    if (songInfo && songInfo.songmid) {
      const lyricText = await getLyricBySongmid(songInfo.songmid);
      if (lyricText && lyricText.trim() !== '') {
        parseLyrics(lyricText);
      } else {
        lyricsContainer.innerHTML = '<p class="lyrics-line">暂无歌词</p>';
      }
    } else {
      lyricsContainer.innerHTML = '<p class="lyrics-line">暂无歌词</p>';
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

// 歌词解析（原逻辑）
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
    cover.classList.add('rotating');
  });

  audio.addEventListener('pause', () => {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    cover.classList.remove('rotating');
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