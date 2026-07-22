const express = require("express");
const { spawn } = require("child_process");
const { readFileSync, readdirSync, mkdirSync, rmSync } = require("fs");
const { join } = require("path");
const { tmpdir } = require("os");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function runCmd(cmd, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `exit code ${code}`));
    });
    proc.on("error", reject);
  });
}

app.get("/api/info", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL이 필요합니다." });

  try {
    const cleanUrl = url.split("&list=")[0].split("&start_radio")[0];
    const raw = await runCmd("yt-dlp", ["--no-warnings", "--dump-json", cleanUrl], 15000);
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
    res.status(500).json({ error: "영상 정보를 가져올 수 없습니다: " + e.message.slice(0, 300) });
  }
});

app.get("/api/download", async (req, res) => {
  const url = req.query.url;
  const quality = req.query.quality || "720";
  const format = req.query.format || "mp4";

  if (!url) return res.status(400).json({ error: "URL이 필요합니다." });

  const cleanUrl = url.split("&list=")[0].split("&start_radio")[0];
  const tmpDir = join(tmpdir(), `ytdl-${Date.now()}`);

  try {
    mkdirSync(tmpDir, { recursive: true });
    const outTemplate = join(tmpDir, "%(title)s.%(ext)s");

    let args;
    if (format === "mp3") {
      args = ["--no-warnings", "-x", "--audio-format", "mp3", "--audio-quality", "192K", "-o", outTemplate, cleanUrl];
    } else {
      args = ["--no-warnings", "-f", `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`, "--merge-output-format", "mp4", "-o", outTemplate, cleanUrl];
    }

    await runCmd("yt-dlp", args, 300000);

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

    try { rmSync(tmpDir, { recursive: true }); } catch {}
  } catch (e) {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
    console.error("Download error:", e.message);
    res.status(500).json({ error: "다운로드 실패: " + e.message.slice(0, 300) });
  }
});

app.listen(PORT, () => {
  console.log(`서버 시작: http://localhost:${PORT}`);
});
