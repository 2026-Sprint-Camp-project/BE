const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authenticateToken = require("../authMiddleware");

//게시글 작성
router.post("/",authenticateToken, async (req, res) => {
  try {
    const content = req.body.content;
    const userId=req.user.userId;

    if (!content) {
      return res.status(400).json({
        message: "내용을 입력해주세요."
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

//게시글 목록 조회
router.get("/", authenticateToken, async (req, res) => {
  const keyword = req.query.keyword;
  const userId = req.user.userId;
  const [rows]=await pool.query(`
    SELECT
      p.post_id,
      p.user_id,
      u.username,
      p.content,
      p.view_count,
      p.created_at,

      EXISTS(
        SELECT 1
        FROM likes l
        WHERE l.post_id = p.post_id
          AND l.user_id = ?
      ) AS liked,

      EXISTS(
        SELECT 1
        FROM bookmarks b
        WHERE b.post_id = p.post_id
          AND b.user_id = ?
      ) AS bookmarked,

    EXISTS(
      SELECT 1
      FROM reposts r
      WHERE r.post_id = p.post_id
        AND r.user_id = ?
    ) AS reposted

    FROM posts p
    JOIN users u
      ON p.user_id=u.user_id

    WHERE p.deleted_at IS NULL
      AND (? IS NULL OR p.content LIKE ?)
    ORDER BY p.created_at DESC
  `, [userId, userId, userId, keyword || null, `%${keyword}%`]);  
 
  const posts = rows.map((post) => ({
    postId: post.post_id,
    userId: post.user_id,
    username: post.username,
    content: post.content,
    viewCount: post.view_count,
    createdAt: post.created_at,
    liked: Boolean(post.liked),
    bookmarked: Boolean(post.bookmarked),
    reposted: Boolean(post.reposted)
  }));
  res.status(200).json({
    posts
  });

});

//게시글 상세 조회
router.get("/:postId", async (req, res) => {
 try{
   const postId = req.params.postId;

 const [rows] = await pool.query(`
  SELECT
    p.post_id,
    p.user_id,
    u.username,
    p.content,
    p.view_count,
    p.created_at,
    p.edited_at
  FROM posts p
  JOIN users u
    ON p.user_id = u.user_id
  WHERE p.post_id = ?
    AND p.deleted_at IS NULL
`, [postId]);

  const post= rows[0];

  if(!post){
    return res.status(404).json({
      message: "게시글을 찾을 수 없습니다. "
    });
  }

  res.status(200).json({
    postId: post.post_id,
    userId: post.user_id,
    username: post.username,
    content: post.content,
    viewCount: post.view_count,
    createdAt: post.created_at,
    editedAt: post.edited_at
  });
}catch(error){
  console.error(error);

    res.status(500).json({
      message: "게시글 상세 조회 실패"

 });
}
});

// 게시글 수정
router.patch("/:postId", authenticateToken, async (req, res) => {
  try{
    const postId = req.params.postId;
    const userId = req.user.userId;
    const content = req.body.content;

    if (!content) {
      return res.status(400).json({
        message: "수정할 내용을 입력해주세요."
      });
    }
   
    const [rows] = await pool.query(
      "SELECT * FROM posts WHERE post_id = ?",
      [postId]
    );

    const post = rows[0];
      if (!post) {
        return res.status(404).json({
          message: "게시글을 찾을 수 없습니다."
        });
      }

      if (post.user_id !== userId) {
        return res.status(403).json({
          message: "게시글을 수정할 권한이 없습니다."
        });
      }

      await pool.query(
        "UPDATE posts SET content = ?, edited_at = NOW() WHERE post_id = ?",
        [content, postId]
      );

      const [updatedRows] = await pool.query(`
        SELECT
          post_id,
          user_id,
          content,
          created_at,
          edited_at
        FROM posts
        WHERE post_id = ?`,
        [postId]
      );

      const updatedPost = updatedRows[0];

      res.status(200).json({
        postId: updatedPost.post_id,
        userId: updatedPost.user_id,
        content: updatedPost.content,
        createdAt: updatedPost.created_at,
        editedAt: updatedPost.edited_at
      });
} catch(error){
  console.error(error);

  res.status(500).json({
    message: "게시글 수정 실패"
  });
}
});

//게시글 삭제
router.delete("/:postId", authenticateToken, async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.user.userId;
    const [rows] = await pool.query(
      "SELECT * FROM posts WHERE post_id = ?",
      [postId]
    );

    const post = rows[0];

    if (!post) {
      return res.status(404).json({
        message: "게시글을 찾을 수 없습니다."
      });
    }

    if (post.user_id !== userId) {
      return res.status(403).json({
        message: "게시글을 삭제할 권한이 없습니다."
      });
    }

    await pool.query(
      "UPDATE posts SET deleted_at = NOW() WHERE post_id = ?",
      [postId]
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "게시글 삭제 실패"
    });
  }
});
