-- 圈子系统深度优化
CREATE TABLE IF NOT EXISTS circle_announcements (
    id SERIAL PRIMARY KEY,
    circle_id INT REFERENCES circles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_essence BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS circle_events (
    id SERIAL PRIMARY KEY,
    circle_id INT REFERENCES circles(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    location VARCHAR(200),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    signup_deadline TIMESTAMP,
    max_participants INT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_participants (
    id SERIAL PRIMARY KEY,
    event_id INT REFERENCES circle_events(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);
