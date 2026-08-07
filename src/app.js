const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const express = require("express");
const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    message: "X 클론 백엔드 서버가 실행 중입니다."
  });
});

app.get("/db-test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS result");

    res.status(200).json({
      message: "MySQL 연결 성공",
      result: rows[0].result
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "MySQL 연결 실패"
    });
  }
});

app.get("/tables", async (req, res) => {
  try {
    const [rows] = await pool.query("SHOW TABLES");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "테이블 조회 실패" });
  }
});

app.post("/posts", async (req, res) => {
  try {
    const { userId, content } = req.body;

    if (!userId || !content) {
      return res.status(400).json({
        message: "userId와 content는 필수입니다."
      });
    }

    const [result] = await pool.query(
      "INSERT INTO posts (user_id, content) VALUES (?, ?)",
      [userId, content]
    );

    res.status(201).json({
      message: "게시글 작성 성공",
      postId: result.insertId
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "게시글 작성 실패"
    });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});