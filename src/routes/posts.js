const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.post("/", async (req, res) => {
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

module.exports = router;