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

        return res.status(204).send();
    }
    catch(error){
        console.error(error);

        return res.status(500).json({
            message: '오류가 발생했습니다.'
        });
    }
});

//3. 좋아요

//4. 좋아요취소
module.exports = router;