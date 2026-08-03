CREATE VIEW post_summary AS
SELECT
    p.post_id,
    p.user_id,
    u.username,
    u.name,
    u.profile_image_url,
    p.content,
    p.reply_to_post_id,
    p.quoted_post_id,
    p.reply_policy,
    p.view_count,
    p.is_pinned,
    p.created_at,
    p.edited_at,
    p.deleted_at,
    COUNT(DISTINCT l.user_id) AS like_count,
    COUNT(DISTINCT r.user_id) AS repost_count,
    COUNT(DISTINCT rp.post_id) AS reply_count
FROM posts p
JOIN users u
    ON u.user_id = p.user_id
LEFT JOIN likes l
    ON l.post_id = p.post_id
LEFT JOIN reposts r
    ON r.post_id = p.post_id
LEFT JOIN posts rp
    ON rp.reply_to_post_id = p.post_id
   AND rp.deleted_at IS NULL
GROUP BY
    p.post_id,
    p.user_id,
    u.username,
    u.name,
    u.profile_image_url,
    p.content,
    p.reply_to_post_id,
    p.quoted_post_id,
    p.reply_policy,
    p.view_count,
    p.is_pinned,
    p.created_at,
    p.edited_at,
    p.deleted_at;

CREATE VIEW repost_feed AS
SELECT
    r.user_id AS reposted_by_user_id,
    ru.username AS reposted_by_username,
    ru.name AS reposted_by_name,
    r.reposted_at,
    ps.*
FROM reposts r
JOIN users ru
    ON ru.user_id = r.user_id
JOIN post_summary ps
    ON ps.post_id = r.post_id;
