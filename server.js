const express = require("express");
const { execSync } = require("child_process");
const { readFileSync, unlinkSync, readdirSync, mkdirSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

// Video info API
app.get("/api/info", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL이 필요합니다." });

  try {
    const cleanUrl = url.split("&list=")[0].split("&start_radio")[0];
    const raw = execSync(`yt-dlp --no-warnings --dump-json "${cleanUrl}"`, {
      encoding: "utf-8",
      timeout: 15000,
    });
    const info = JSON.parse(raw);
    const duration = parseInt(info.duration || "0", 10);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;

    res.json({
      title: info.title || "",
      author: info.uploader || info.channel || "",
      thumbnail: info.thumbnail || "",
      duration: `${mins}:${secs.toString().padStart(2, "0")}`,
    });
  } catch (e) {
    console.error("Info error:", e.message);
    res.status(500).json({ error: "영상 정보를 가져올 수 없습니다." });
  }
});

// Download API
app.get("/api/download", (req, res) => {
  const url = req.query.url;
  const quality = req.query.quality || "720";
  const format = req.query.format || "mp4";

  if (!url) return res.status(400).json({ error: "URL이 필요합니다." });

  const cleanUrl = url.split("&list=")[0].split("&start_radio")[0];
  const tmpDir = join(tmpdir(), `ytdl-${Date.now()}`);

  try {
    mkdirSync(tmpDir, { recursive: true });

    let cmd;
    if (format === "mp3") {
      cmd = `yt-dlp --no-warnings -x --audio-format mp3 --audio-quality 192K -o "${join(tmpDir, "%(title)s.%(ext)s")}" "${cleanUrl}"`;
    } else {
      cmd = `yt-dlp --no-warnings -f "bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best" --merge-output-format mp4 -o "${join(tmpDir, "%(title)s.%(ext)s")}" "${cleanUrl}"`;
    }

    execSync(cmd, { encoding: "utf-8", timeout: 300000 });

    const files = readdirSync(tmpDir);
    if (files.length === 0) {
      return res.status(500).json({ error: "다운로드된 파일이 없습니다." });
    }

    const filePath = join(tmpDir, files[0]);
    const fileBuffer = readFileSync(filePath);
    const fileName = files[0];
    const ext = fileName.split(".").pop() || "mp4";
    const contentType = ext === "mp3" ? "audio/mpeg" : "video/mp4";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", fileBuffer.length);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(fileBuffer);

    // Cleanup
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  } catch (e) {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
    console.error("Download error:", e.message);
    res.status(500).json({ error: "다운로드 실패: " + e.message.slice(0, 200) });
  }
});

app.listen(PORT, () => {
  console.log(`서버 시작: http://localhost:${PORT}`);
});
