const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const authenticateToken = require('../authMiddleware');
 
//1. 팔로우
router.post('/users/:userId/follow', authenticateToken, async (req, res) => {
    const followerId = req.user.userId;
    const followingId = Number(req.params.userId);
 
    try{
        //자기자신 팔로우X
        if (followerId === followingId){
            return res.status(400).json({
                message : '자기 자신은 팔로우할 수 없습니다.'
            });
        }
 
        //팔로우 대상 유저 존재하는지 확인
        const [users] = await pool.query(
            `SELECT user_id FROM users WHERE user_id=?`,
            [followingId]
        );
 
        if(users.length === 0){
            return res.status(404).json({
                message : '사용자를 찾을 수 없습니다.'
            });
        }
 
        //팔로우 여부 확인
        const [follows] = await pool.query(
            `SELECT follower_id
             FROM follows
             WHERE follower_id = ? AND following_id = ?`,
             [followerId, followingId]
        );
 
        if(follows.length > 0){
            return res.status(409).json({
                message : '이미 팔로우한 사용자입니다.'
            });
        }
 
        //팔로우
        const [result] = await pool.query(
            `INSERT INTO follows(follower_id, following_id)
             VALUES (?, ?)`,
             [followerId, followingId]
        );
 
        // 팔로우 알림 생성
        if (followerId !== followingId) {
            await pool.query(
                `INSERT INTO notifications
                 (receiver_id, sender_id, notification_type, post_id)
                 VALUES (?, ?, 'FOLLOW', NULL)`,
             [followingId, followerId]
         );
        }
 
        const [followData] = await pool.query(
            `SELECT *
             FROM follows
             WHERE follower_id = ? AND following_id = ?`,
             [followerId, followingId]
        );
 
        return res.status(201).json({
            followerId : followData[0].follower_id,
            followingId : followData[0].following_id,
            createdAt : followData[0].followed_at
        });
    }
    catch(error){
        console.error(error);
 
        res.status(500).json({
            message: '오류가 발생했습니다.'
        });
    }
});
 
//2. 언팔로우
router.delete('/users/:userId/follow', authenticateToken, async (req, res) => {
    const followerId = req.user.userId;
    const followingId = Number(req.params.userId);
 
    try{
        const [result] = await pool.query(
            `DELETE FROM follows
             WHERE follower_id = ? AND following_id = ?`,
             [followerId, followingId]
        );
 
        if(result.affectedRows === 0){
            return res.status(404).json({
                message: '팔로우 중인 사용자가 아닙니다.'
            });
        }
 
        // FOLLOW 알림 삭제
        await pool.query(
            `DELETE FROM notifications
            WHERE receiver_id = ?
            AND sender_id = ?
            AND notification_type = 'FOLLOW'
            AND post_id IS NULL`,
            [followingId, followerId]
        );
 
        return res.status(204).send();
    }
    catch(error){
        console.error(error);
 
        return res.status(500).json({
            message: '오류가 발생했습니다.'
        });
    }
});
 
//3. 팔로워 목록 조회
router.get("/users/:userId/followers", authenticateToken, async (req, res) => {
    const userId = Number(req.params.userId);
    // FIX: myId는 로그인한 사용자의 ID여야 함 (기존 코드는 cursor로 계산하는 버그였음)
    const myId = req.user.userId;
    const cursor = req.query.cursor;
    const size = Number(req.query.size) || 20;
 
 
    try{
        const [users] = await pool.query(
            `SELECT user_id
             FROM users
             WHERE user_id = ?`,
            [userId]
        );
 
        if(users.length === 0){
            return res.status(404).json({
                message: "사용자를 찾을 수 없습니다."
            });
        }
 
        let sql = `
            SELECT f.followed_at, u.user_id, u.username, u.name, u.profile_image_url, 
                 EXISTS (
                    SELECT 1
                    FROM follows my_follow
                    WHERE my_follow.follower_id = ?
                      AND my_follow.following_id = u.user_id
                 ) AS is_following
            FROM follows f JOIN users u 
                 ON f.follower_id=u.user_id
            WHERE f.following_id = ?`;
 
        const params = [myId, userId];
 
        if(cursor){
            sql += `
                AND f.followed_at < ?`;
            params.push(cursor);
        }
 
        sql += `
            ORDER BY f.followed_at DESC LIMIT ?`;
        params.push(size+1);
 
        const [rows] = await pool.query(sql, params);
 
        const hasNext = rows.length > size;
        const followers = hasNext ? rows.slice(0, size) : rows;
 
        return res.status(200).json({
            followers: followers.map(user => ({
                userId: user.user_id,
                username: user.username,
                name: user.name,
                profileImageUrl: user.profile_image_url,
                isFollowing: Boolean(user.is_following)
            })),
            // FIX: 존재하지 않는 follow_id 대신 followed_at 사용 (커서 비교 컬럼과 일치시킴)
            nextCursor: hasNext
                ? followers[followers.length - 1].followed_at
                : null,
            hasNext
        });
    }
    catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//4. 팔로잉 목록 조회
router.get("/users/:userId/following", authenticateToken, async (req, res) => {
    const userId = Number(req.params.userId);
    // FIX: myId는 로그인한 사용자의 ID여야 함 (기존 코드는 req.params.userId를 그대로 사용하는 버그였음)
    const myId = req.user.userId;
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const size = Number(req.query.size) || 20;
 
    try{
        const [users] = await pool.query(
            `SELECT user_id
             FROM users
             WHERE user_id = ?`,
            [userId]
        );
 
        if(users.length === 0){
            return res.status(404).json({
                message: "사용자를 찾을 수 없습니다."
            });
        }
 
        let sql = `
            SELECT f.followed_at, u.user_id, u.username, u.name, u.profile_image_url, 
                 EXISTS (
                    SELECT 1
                    FROM follows my_follow
                    WHERE my_follow.follower_id = ?
                      AND my_follow.following_id = u.user_id
                 ) AS is_following
            FROM follows f JOIN users u 
                 ON f.following_id=u.user_id
            WHERE f.follower_id = ?`;
 
        const params = [myId, userId];
 
        if(cursor){
            sql += `
                AND f.followed_at < ?`;
            params.push(cursor);
        }
 
        sql += `
            ORDER BY f.followed_at DESC LIMIT ?`;
        params.push(size+1);
 
        const [rows] = await pool.query(sql, params);
 
        const hasNext = rows.length > size;
        const following = hasNext ? rows.slice(0, size) : rows;
 
        return res.status(200).json({
            following: following.map(user => ({
                userId: user.user_id,
                username: user.username,
                name: user.name,
                profileImageUrl: user.profile_image_url,
                isFollowing: Boolean(user.is_following)
            })),
            nextCursor: hasNext
                ? following[following.length - 1].followed_at
                : null,
            hasNext
        });
    }
    catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//5. 좋아요
router.post("/posts/:postId/likes", authenticateToken, async(req, res) =>{
    const userId = req.user.userId;
    const postId = Number(req.params.postId);
 
    try {
        // 게시글 존재 여부 확인
        // FIX: postOwnerId를 사용하려면 user_id도 함께 SELECT해야 함
        const [posts] = await pool.query(
            `SELECT post_id, user_id
             FROM posts
             WHERE post_id = ?`,
            [postId]
        );
 
        if (posts.length === 0) {
            return res.status(404).json({
                message: "게시글을 찾을 수 없습니다."
            });
        }
 
        // 이미 좋아요했는지 확인
        const [likes] = await pool.query(
            `SELECT user_id
             FROM likes
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        if (likes.length > 0) {
            return res.status(409).json({
                message: "이미 좋아요한 게시글입니다."
            });
        }
 
        const postOwnerId = posts[0].user_id;
 
        // 좋아요 추가
        await pool.query(
            `INSERT INTO likes (user_id, post_id)
             VALUES (?, ?)`,
            [userId, postId]
        );
 
        // 좋아요 알림 생성
        if (postOwnerId !== userId) {
            await pool.query(
                `INSERT INTO notifications
                 (receiver_id, sender_id, notification_type, post_id)
                 VALUES (?, ?, 'LIKE', ?)`,
                [postOwnerId, userId, postId]
            );
        }
 
        // 추가된 좋아요 정보 조회
        const [likeData] = await pool.query(
            `SELECT user_id, post_id, liked_at
             FROM likes
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        return res.status(201).json({
            userId: likeData[0].user_id,
            postId: likeData[0].post_id,
            likedAt: likeData[0].liked_at
        });
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//6. 좋아요 취소
router.delete("/posts/:postId/likes", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const postId = Number(req.params.postId);
 
    try {
        // FIX: postOwnerId가 정의되지 않은 채 사용되던 버그 - 알림 삭제 전에 게시글 소유자를 조회
        const [posts] = await pool.query(
            `SELECT user_id
             FROM posts
             WHERE post_id = ?`,
            [postId]
        );
 
        if (posts.length === 0) {
            return res.status(404).json({
                message: "게시글을 찾을 수 없습니다."
            });
        }
 
        const postOwnerId = posts[0].user_id;
 
        const [result] = await pool.query(
            `DELETE FROM likes
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "좋아요 정보를 찾을 수 없습니다."
            });
        }
 
        // 좋아요 알림 삭제
        await pool.query(
            `DELETE FROM notifications
             WHERE receiver_id = ?
               AND sender_id = ?
               AND notification_type = 'LIKE'
               AND post_id = ?`,
            [postOwnerId, userId, postId]
        );
 
        return res.status(204).send();
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//7. 좋아요 목록 조회
router.get("/posts/:postId/likes", authenticateToken, async (req, res) => {
    const postId = Number(req.params.postId);
    const myId = req.user.userId;
    const cursor = req.query.cursor || null;
    const size = Number(req.query.size) || 20;
 
    try {
        // 게시글 존재 여부 확인
        const [posts] = await pool.query(
            `SELECT post_id
             FROM posts
             WHERE post_id = ?`,
            [postId]
        );
 
        if (posts.length === 0) {
            return res.status(404).json({
                message: "게시글을 찾을 수 없습니다."
            });
        }
 
        let sql = `
            SELECT
                u.user_id,
                u.username,
                u.name,
                u.profile_image_url,
                l.liked_at,
                EXISTS (
                    SELECT 1
                    FROM follows f
                    WHERE f.follower_id = ?
                      AND f.following_id = u.user_id
                ) AS is_following
            FROM likes l
            JOIN users u
              ON l.user_id = u.user_id
            WHERE l.post_id = ?
        `;
 
        const params = [myId, postId];
 
        if (cursor) {
            sql += ` AND l.liked_at < ?`;
            params.push(cursor);
        }
 
        sql += `
            ORDER BY l.liked_at DESC
            LIMIT ?
        `;
 
        params.push(size + 1);
 
        const [rows] = await pool.query(sql, params);
 
        const hasNext = rows.length > size;
        const likes = hasNext ? rows.slice(0, size) : rows;
 
        return res.status(200).json({
            users: likes.map(user => ({
                userId: user.user_id,
                username: user.username,
                name: user.name,
                profileImageUrl: user.profile_image_url,
                isFollowing: Boolean(user.is_following)
            })),
            nextCursor: hasNext
                ? likes[likes.length - 1].liked_at
                : null,
            hasNext
        });
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//8. 북마크 저장
router.post("/posts/:postId/bookmarks", authenticateToken, async(req, res) => {
    const postId = Number(req.params.postId);
    const userId = req.user.userId;
 
    try {
        // 게시글 존재 여부 확인
        const [posts] = await pool.query(
            `SELECT post_id
             FROM posts
             WHERE post_id = ?`,
            [postId]
        );
 
        if (posts.length === 0) {
            return res.status(404).json({
                message: "게시글을 찾을 수 없습니다."
            });
        }
 
        const [bookmarks] = await pool.query(
            `SELECT user_id
             FROM bookmarks
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        if (bookmarks.length > 0) {
            return res.status(409).json({
                message: "이미 저장한 게시글입니다."
            });
        }
 
        await pool.query(
            `INSERT INTO bookmarks (user_id, post_id)
             VALUES (?, ?)`,
            [userId, postId]
        );
 
        const [bookmarkData] = await pool.query(
            `SELECT user_id, post_id, bookmarked_at
             FROM bookmarks
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        return res.status(201).json({
            userId: bookmarkData[0].user_id,
            postId: bookmarkData[0].post_id,
            bookmarkedAt: bookmarkData[0].bookmarked_at
        });
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//9. 북마크 취소
router.delete("/posts/:postId/bookmarks", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const postId = Number(req.params.postId);
 
    try {
        const [result] = await pool.query(
            `DELETE FROM bookmarks
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "북마크 정보를 찾을 수 없습니다."
            });
        }
 
        return res.status(204).send();
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//10. 북마크 조회
router.get("/users/me/bookmarks", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const cursor = req.query.cursor || null;
    const size = Number(req.query.size) || 20;
 
    try {
        let sql = `
            SELECT
                p.post_id,
                p.user_id,
                u.username,
                p.content,
                p.created_at,
                b.bookmarked_at
            FROM bookmarks b
            JOIN posts p
              ON b.post_id = p.post_id
            JOIN users u
              ON p.user_id = u.user_id
            WHERE b.user_id = ?
        `;
 
        const params = [userId];
 
        if (cursor) {
            sql += ` AND b.bookmarked_at < ?`;
            params.push(cursor);
        }
 
        sql += `
            ORDER BY b.bookmarked_at DESC
            LIMIT ?
        `;
 
        params.push(size + 1);
 
        const [rows] = await pool.query(sql, params);
 
        const hasNext = rows.length > size;
        const bookmarks = hasNext ? rows.slice(0, size) : rows;
 
        return res.status(200).json({
            bookmarks: bookmarks.map(bookmark => ({
                postId: bookmark.post_id,
                userId: bookmark.user_id,
                username: bookmark.username,
                content: bookmark.content,
                createdAt: bookmark.created_at,
                bookmarkedAt: bookmark.bookmarked_at
            })),
            nextCursor: hasNext
                ? bookmarks[bookmarks.length - 1].bookmarked_at
                : null,
            hasNext
        });
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//11. 리포스트
router.post("/posts/:postId/reposts", authenticateToken, async(req, res) => {
    const userId = req.user.userId;
    const postId = Number(req.params.postId);
 
    try {
        // 게시글 존재 여부 확인
        // FIX: postOwnerId를 사용하려면 user_id도 함께 SELECT해야 함
        const [posts] = await pool.query(
            `SELECT post_id, user_id
             FROM posts
             WHERE post_id = ?`,
            [postId]
        );
 
        if (posts.length === 0) {
            return res.status(404).json({
                message: "게시글을 찾을 수 없습니다."
            });
        }
 
        // 이미 리포스트했는지 확인
        const [reposts] = await pool.query(
            `SELECT user_id
             FROM reposts
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        if (reposts.length > 0) {
            return res.status(409).json({
                message: "이미 리포스트한 게시글입니다."
            });
        }
 
        const postOwnerId = posts[0].user_id;
 
        // 리포스트 추가
        await pool.query(
            `INSERT INTO reposts (user_id, post_id)
             VALUES (?, ?)`,
            [userId, postId]
        );
 
        // 리포스트 알림
        if (postOwnerId !== userId) {
            await pool.query(
                `INSERT INTO notifications
                 (receiver_id, sender_id, notification_type, post_id)
                 VALUES (?, ?, 'REPOST', ?)`,
                [postOwnerId, userId, postId]
            );
        }
 
        // 추가된 리포스트 정보 조회
        const [repostData] = await pool.query(
            `SELECT user_id, post_id, reposted_at
             FROM reposts
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        return res.status(201).json({
            userId: repostData[0].user_id,
            postId: repostData[0].post_id,
            repostedAt: repostData[0].reposted_at
        });
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//12. 리포스트 취소
router.delete("/posts/:postId/reposts", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const postId = Number(req.params.postId);
 
    try {
        // FIX: postOwnerId가 정의되지 않은 채 사용되던 버그 - 알림 삭제 전에 게시글 소유자를 조회
        const [posts] = await pool.query(
            `SELECT user_id
             FROM posts
             WHERE post_id = ?`,
            [postId]
        );
 
        if (posts.length === 0) {
            return res.status(404).json({
                message: "게시글을 찾을 수 없습니다."
            });
        }
 
        const postOwnerId = posts[0].user_id;
 
        const [result] = await pool.query(
            `DELETE FROM reposts
             WHERE user_id = ? AND post_id = ?`,
            [userId, postId]
        );
 
        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "리포스트 정보를 찾을 수 없습니다."
            });
        }
 
        await pool.query(
            `DELETE FROM notifications
             WHERE receiver_id = ?
               AND sender_id = ?
               AND notification_type = 'REPOST'
               AND post_id = ?`,
            [postOwnerId, userId, postId]
        );
 
        return res.status(204).send();
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//13. 리포스트 목록 조회
router.get("/posts/:postId/reposts", authenticateToken, async (req, res) => {
    const postId = Number(req.params.postId);
    const myId = req.user.userId;
    const cursor = req.query.cursor || null;
    const size = Number(req.query.size) || 20;
 
    try {
        // 게시글 존재 여부 확인
        const [posts] = await pool.query(
            `SELECT post_id
             FROM posts
             WHERE post_id = ?`,
            [postId]
        );
 
        if (posts.length === 0) {
            return res.status(404).json({
                message: "게시글을 찾을 수 없습니다."
            });
        }
 
        let sql = `
            SELECT
                u.user_id,
                u.username,
                u.name,
                u.profile_image_url,
                r.reposted_at,
                EXISTS (
                    SELECT 1
                    FROM follows f
                    WHERE f.follower_id = ?
                      AND f.following_id = u.user_id
                ) AS is_following
            FROM reposts r
            JOIN users u
              ON r.user_id = u.user_id
            WHERE r.post_id = ?
        `;
 
        const params = [myId, postId];
 
        if (cursor) {
            sql += ` AND r.reposted_at < ?`;
            params.push(cursor);
        }
 
        sql += `
            ORDER BY r.reposted_at DESC
            LIMIT ?
        `;
 
        params.push(size + 1);
 
        const [rows] = await pool.query(sql, params);
 
        const hasNext = rows.length > size;
        const reposts = hasNext
            ? rows.slice(0, size)
            : rows;
 
        return res.status(200).json({
            users: reposts.map(user => ({
                userId: user.user_id,
                username: user.username,
                name: user.name,
                profileImageUrl: user.profile_image_url,
                isFollowing: Boolean(user.is_following)
            })),
            nextCursor: hasNext
                ? reposts[reposts.length - 1].reposted_at
                : null,
            hasNext
        });
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
//14. 알림 목록 조회
router.get("/notifications", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const size = Number(req.query.size) || 20;
 
    try {
        let sql = `
            SELECT
                n.notification_id,
                n.notification_type,
                n.post_id,
                n.created_at,
                u.user_id AS sender_id,
                u.username,
                u.name,
                u.profile_image_url
            FROM notifications n
            JOIN users u
              ON n.sender_id = u.user_id
            WHERE n.receiver_id = ?
        `;
 
        const params = [userId];
 
        if (cursor) {
            sql += ` AND n.notification_id < ?`;
            params.push(cursor);
        }
 
        sql += `
            ORDER BY n.notification_id DESC
            LIMIT ?
        `;
 
        params.push(size + 1);
 
        const [rows] = await pool.query(sql, params);
 
        const hasNext = rows.length > size;
        const notifications = hasNext
            ? rows.slice(0, size)
            : rows;
 
        return res.status(200).json({
            notifications: notifications.map(notification => ({
                notificationId: notification.notification_id,
                notificationType: notification.notification_type,
                sender: {
                    userId: notification.sender_id,
                    username: notification.username,
                    name: notification.name,
                    profileImageUrl: notification.profile_image_url
                },
                postId: notification.post_id,
                createdAt: notification.created_at
            })),
            nextCursor: hasNext
                ? notifications[notifications.length - 1].notification_id
                : null,
            hasNext
        });
 
    } catch (error) {
        console.error(error);
 
        return res.status(500).json({
            message: "서버 오류가 발생했습니다."
        });
    }
});
 
module.exports = router;