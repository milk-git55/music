(function() {
    // ==================== 初始化元素 ====================
    const svgcontainer = document.querySelector(".svgcontainer");
    const audioPlayer = document.querySelector(".player");
    audioPlayer.loop = true;
    const progressBar = document.querySelector(".processbar");
    const process = document.querySelector(".process");
    const startTime = document.querySelector(".start");
    const endTime = document.querySelector(".end");
    const playBtn = document.querySelector(".play");
    const pauseBtn = document.querySelector(".pause");
    const audioName = document.querySelector(".name");
    const lyricsContainer = document.querySelector(".lyricscontainer");
    const lyricsElement = document.querySelector(".lyrics");

    // 常量
    const LINE_HEIGHT = 20;
    const LYRICS_OFFSET = window.innerHeight / 3.5;

    let playing = false;
    let isDragging = false;
    let lrcData;
    let lyrics = [];
    let allTimes = [];
    let lastLyric = -1;
    let bgImg = new Image();
    bgImg.src = "template/src/default.png";  // 确保路径正确

    // ==================== API 基础地址 ====================
    const KUWO_API_BASE = 'https://oiapi.net/api/Kuwo';
    const QQMUSIC_API_BASE = 'https://api.wuhy.de5.net'; // 您的 QQ 音乐 API 地址
    const DEFAULT_BR = 1;

    // ---------- 酷我 API 函数 ----------
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
                return data.data.url;
            }
            return null;
        } catch (error) {
            console.error('通过标题获取播放链接失败:', error);
            return null;
        }
    }

    // ---------- QQ音乐 API 相关函数（封面、歌词）----------
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

    // ==================== 从 URL 获取参数 ====================
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const source = urlParams.get('source') || 'kuwo';
    const title = urlParams.get('title') || '未知歌曲';
    const artist = urlParams.get('artist') || '未知歌手';
    const picId = urlParams.get('picId');

    audioName.textContent = `${title} - ${artist}`;

    // ==================== 加载歌曲 ====================
    async function loadSong() {
        if (!title) {
            audioName.textContent = '参数错误，无法加载歌曲';
            return;
        }

        try {
            // 1. 获取播放链接（酷我）
            const playUrl = await getMusicUrlByTitle(title);
            if (playUrl) {
                audioPlayer.src = playUrl;
            } else {
                throw new Error('无法获取播放链接');
            }

            // 2. 设置封面（优先使用 picId，否则通过 albummid 获取）
            if (picId && picId !== '') {
                bgImg.src = picId;
            } else {
                const songInfo = await searchSongInfo(title, artist);
                if (songInfo && songInfo.albummid) {
                    const coverUrl = await getCoverUrlByAlbummid(songInfo.albummid);
                    if (coverUrl) bgImg.src = coverUrl;
                }
            }

            // 3. 获取歌词
            const songInfo = await searchSongInfo(title, artist);
            if (songInfo && songInfo.songmid) {
                const lyricText = await getLyricBySongmid(songInfo.songmid);
                if (lyricText && lyricText.trim() !== '') {
                    processLrcText(lyricText);
                } else {
                    lyricsElement.innerHTML = '<div class="item"><p>暂无歌词</p></div>';
                }
            } else {
                lyricsElement.innerHTML = '<div class="item"><p>暂无歌词</p></div>';
            }

        } catch (error) {
            console.error('加载歌曲失败:', error);
            audioName.textContent = '加载失败，请重试';
        }
    }

    loadSong();

    // ==================== 图片加载完成后触发背景动画 ====================
    bgImg.onload = () => {
        document.querySelector(".svg").style.display = "none";
        svgcontainer.style.background = `url(${bgImg.src})`;
        svgcontainer.style.backgroundSize = "cover";
        svgcontainer.style.backgroundPosition = "center";

        const fluidCanvas = document.querySelector("canvas.canvas");
        const fCtx = fluidCanvas.getContext('2d');

        const resize = () => {
            fluidCanvas.width = window.innerWidth;
            fluidCanvas.height = window.innerHeight;
        };
        window.onresize = resize;
        resize();

        class Slice {
            constructor(img, index, canvas) {
                this.img = img;
                this.index = index;
                this.canvas = canvas;
                this.ctx = canvas.getContext('2d');
                this.angle = Math.random() * Math.PI * 2;
                this.velocity = (Math.random() - 0.5) * 0.005;
                this.scale = 1.2;
            }
            update() { this.angle += this.velocity; }
            draw() {
                const { width, height } = this.canvas;
                const ctx = this.ctx;
                const centerX = (this.index % 2 === 0) ? width * 0.25 : width * 0.75;
                const centerY = (this.index < 2) ? height * 0.25 : height * 0.75;

                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(this.angle);
                ctx.scale(this.scale, this.scale);

                const sw = this.img.width / 2;
                const sh = this.img.height / 2;
                const sx = (this.index % 2) * sw;
                const sy = Math.floor(this.index / 2) * sh;

                const drawSize = Math.max(width, height) * 0.6;
                ctx.globalAlpha = 0.7;
                ctx.drawImage(this.img, sx, sy, sw, sh, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
                ctx.restore();
            }
        }

        const slices = [0, 1, 2, 3].map(i => new Slice(bgImg, i, fluidCanvas));

        function animate() {
            fCtx.clearRect(0, 0, fluidCanvas.width, fluidCanvas.height);
            fCtx.globalCompositeOperation = 'screen';
            slices.forEach(slice => {
                slice.update();
                slice.draw();
            });
            requestAnimationFrame(animate);
        }
        animate();
    };

    // ==================== 播放器控制 ====================
    audioPlayer.addEventListener("loadedmetadata", () => {
        endTime.textContent = `-${formatTime(audioPlayer.duration)}`;
        playBtn.click(); // 自动播放
    });

    audioPlayer.addEventListener("timeupdate", () => {
        if (audioPlayer.duration) {
            process.style.width = `${(audioPlayer.currentTime / audioPlayer.duration) * 100}%`;
            startTime.textContent = formatTime(audioPlayer.currentTime);
            endTime.textContent = `-${formatTime(audioPlayer.duration - audioPlayer.currentTime)}`;

            const cTime = audioPlayer.currentTime;
            let lList = [];
            for (let i = 0; i < lyrics.length; i++) {
                if (cTime >= lyrics[i].time) {
                    lList.push(lyrics[i]);
                }
            }
            if (lList.length === 0) return;
            if (lastLyric !== lList.length - 1) {
                UpdateLyricsLayout(lList.length - 1, lyrics, 1);
                lastLyric = lList.length - 1;
            }
        }
    });

    progressBar.addEventListener("mousedown", (event) => {
        if (Number.isNaN(audioPlayer.duration)) return;
        isDragging = true;
        updateProgress(event);
    });

    document.addEventListener("mousemove", (event) => {
        if (isDragging) updateProgress(event);
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
    });

    playBtn.addEventListener("click", () => {
        if (Number.isNaN(audioPlayer.duration)) return;
        playing = true;
        audioPlayer.play();
        pauseBtn.style.display = "block";
        playBtn.style.display = "none";
    });

    pauseBtn.addEventListener("click", () => {
        playing = false;
        audioPlayer.pause();
        pauseBtn.style.display = "none";
        playBtn.style.display = "block";
    });

    function updateProgress(event) {
        const rect = progressBar.getBoundingClientRect();
        const clickPosition = event.clientX - rect.left;
        const progressBarWidth = rect.width;
        const percentage = (clickPosition / progressBarWidth) * 100;
        process.style.width = `${percentage}%`;
        audioPlayer.currentTime = (percentage / 100) * audioPlayer.duration;

        if (!playing) {
            playBtn.click();
        }
    }

    function formatTime(time) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    }

    // ==================== 歌词解析与布局 ====================
    function processLrcText(text) {
        lrcData = text;
        let parsedData = parseLrc(lrcData);
        lyrics = parsedData.lyrics;
        allTimes = parsedData.allTimes;

        lyricsElement.innerHTML = "";
        for (let i = 0; i < lyrics.length; i++) {
            lyricsElement.appendChild(lyrics[i].ele);
        }

        UpdateLyricsLayout(0, lyrics, 0);
        for (let i = 0; i < lyrics.length; i++) {
            lyrics[i].ele.style.transition = "all 0.7s cubic-bezier(.19,.11,0,1)";
        }
    }

    function parseLrc(lrcText) {
        const lines = lrcText.trim().split('\n');
        const lrcArray = [];
        const allTimes = [];

        lines.forEach(line => {
            const timeMatch = line.match(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/);
            if (timeMatch) {
                const minutes = parseInt(timeMatch[1], 10);
                const seconds = parseInt(timeMatch[2], 10);
                const milliseconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
                const text = line.replace(timeMatch[0], '').trim();
                const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;
                allTimes.push(timeInSeconds);

                const div = document.createElement('div');
                div.className = 'item';
                const p = document.createElement('p');
                p.textContent = text;
                div.appendChild(p);
                if (text) {
                    lrcArray.push({ time: timeInSeconds, text, ele: div });
                }
            }
        });
        return { lyrics: lrcArray, allTimes: allTimes };
    }

    function GetLyricsLayout(now, to, data) {
        let res = 0;
        if (to > now) {
            for (let i = now; i < to; i++) {
                res += data[i].ele.offsetHeight + LINE_HEIGHT;
            }
        } else {
            for (let i = now; i > to; i--) {
                res -= data[i - 1].ele.offsetHeight + LINE_HEIGHT;
            }
        }
        return res + LYRICS_OFFSET;
    }

    function UpdateLyricsLayout(index, data, init = 1) {
        for (let i = 0; i < data.length; i++) {
            if (i === index && init) {
                data[i].ele.style.color = "rgba(255,255,255,1)";
            } else {
                data[i].ele.style.color = "rgba(255,255,255,0.2)";
            }
            data[i].ele.style.filter = `blur(${Math.abs(i - index)}px)`;
            const position = GetLyricsLayout(index, i, data);
            let n = (i - index) + 1;
            if (n > 10) n = 0;
            setTimeout(() => {
                data[i].ele.style.transform = `translateY(${position}px)`;
            }, (n * 70 - n * 10) * init);
        }
    }
})();