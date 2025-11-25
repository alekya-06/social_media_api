import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    email: string;
    isAdmin: boolean;
  };
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'test_123';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        post_id INT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        post_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, post_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS follows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        follower_id INT NOT NULL,
        following_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id),
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        source_user_id INT NOT NULL,
        post_id INT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (source_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `);

    connection.release();
    console.log(' Database tables initialized successfully');
    
  } catch (error) {
    console.error(' Database initialization failed:', error);
    throw error;
  }
}

// Middleware
app.use(cors());
app.use(express.json());


const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET) as { userId: number; email: string, isAdmin:boolean };
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
};

app.use(express.static('public'));


//app.get('/', (req: Request, res: Response) => {
//  res.json({ 
//    success: true, 
//    message: 'Social Media API is running!',
//    timestamp: new Date().toISOString()
//  });
//});

app.get('/', (req: Request, res: Response) => {
    res.sendFile('webpage.html', { root: 'public' });
});

//API status check
app.get('/api', (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'Social Media API is running!',
    timestamp: new Date().toISOString()
  });
});

// Register endpoint
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }

    // Check if user exists
    const [existingUsers] =  await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if ((existingUsers as any[]).length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'User already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const isAdmin = email.endsWith('_admin@gmail.com') || email === 'admin@social.com';

    // Create user (like storing in your JS list)
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, isAdmin]
    );

    const insertResult = result as any;
    const userId = insertResult.insertId;

    // Get the created user
    const [users] = await pool.execute(
      'SELECT id, username, email, is_admin, created_at FROM users WHERE id = ?',
      [userId]
    );

    const newUser = (users as any[])[0];

    // Generate token
    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, isAdmin: newUser.is_admin }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      success: true,
      data: {
        token,
        user: newUser
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    const user = (users as any[])[0];

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin:user.is_admin }, 
      JWT_SECRET, 
      { expiresIn: '24h' 
    });

    // Return response
    const { password_hash, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      data: {
        token,
        user: userWithoutPassword
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Update create post endpoint for MySQL
app.post('/api/posts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content } = req.body;
    const userId = req.user!.userId;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    // MySQL version
    const [result] = await pool.execute(
      'INSERT INTO posts (user_id, content) VALUES (?, ?)',
      [userId, content]
    );

    const insertResult = result as any;
    
    // Get the created post with username
    const [posts] = await pool.execute(`
      SELECT p.*, u.username 
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      WHERE p.id = ?
    `, [insertResult.insertId]);

    const newPost = (posts as any[])[0];

    res.status(201).json({
      success: true,
      data: newPost
    });

  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update get all posts for MySQL
app.get('/api/posts', async (req: Request, res: Response) => {
  try {
    // MySQL version
    const [posts] = await pool.execute(`
      SELECT p.*, u.username 
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      ORDER BY p.created_at DESC
    `);

    res.json({
      success: true,
      data: posts
    });

  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/posts/:postId/like', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = parseInt(req.params.postId);
    const userId = req.user!.userId;

    // Check if already liked
    const [existingLikes] = await pool.execute(
      'SELECT * FROM likes WHERE user_id = ? AND post_id = ?',
      [userId, postId]
    );

    if ((existingLikes as any[]).length > 0) {
      // Unlike
      await pool.execute('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [userId, postId]);
      res.json({ 
        success: true, 
        data: { liked: false } 
      });
    } else {
      // Like
      await pool.execute('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [userId, postId]);

      //  ADD NOTIFICATION: Get post owner to notify them
      const [posts] = await pool.execute('SELECT user_id FROM posts WHERE id = ?', [postId]);
      const post = (posts as any[])[0];

      // Only notify if the post owner is not the one liking (don't notify yourself)
      if (post.user_id !== userId) {
        await pool.execute(
          'INSERT INTO notifications (user_id, type, source_user_id, post_id) VALUES (?, ?, ?, ?)',
          [post.user_id, 'like', userId, postId]
        );
      }

      res.json({ 
        success: true, 
        data: { liked: true } 
      });
    }

  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get user profile
app.get('/api/users/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Get user basic info
    const [users] = await pool.execute(
      'SELECT id, username, email, created_at FROM users WHERE id = ?',
      [userId]
    );

    const user = (users as any[])[0];
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get post count
    const [postCountResult] = await pool.execute(
      'SELECT COUNT(*) as count FROM posts WHERE user_id = ?',
      [userId]
    );

    // Get follower count
    const [followerCountResult] = await pool.execute(
      'SELECT COUNT(*) as count FROM follows WHERE following_id = ?',
      [userId]
    );

    // Get following count  
    const [followingCountResult] = await pool.execute(
      'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?',
      [userId]
    );

    // Check if current user is following this profile (if authenticated)
    let isFollowing = false;
    if (req.user) {
      const [followStatus] = await pool.execute(
        'SELECT * FROM follows WHERE follower_id = ? AND following_id = ?',
        [req.user.userId, userId]
      );
      isFollowing = (followStatus as any[]).length > 0;
    }

    res.json({
      success: true,
      data: {
        ...user,
        stats: {
          posts: (postCountResult as any[])[0].count,
          followers: (followerCountResult as any[])[0].count,
          following: (followingCountResult as any[])[0].count
        },
        isFollowing
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Follow/unfollow user
app.post('/api/users/:userId/follow', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const followerId = req.user!.userId;

    // Can't follow yourself
    if (targetUserId === followerId) {
      return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
    }

    // Check if target user exists
    const [targetUsers] = await pool.execute('SELECT id FROM users WHERE id = ?', [targetUserId]);
    if ((targetUsers as any[]).length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if already following
    const [existingFollows] = await pool.execute(
      'SELECT * FROM follows WHERE follower_id = ? AND following_id = ?',
      [followerId, targetUserId]
    );

    if ((existingFollows as any[]).length > 0) {
      // Unfollow
      await pool.execute(
        'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
        [followerId, targetUserId]
      );
      res.json({ 
        success: true, 
        data: { following: false } 
      });
    } else {
      // Follow
      await pool.execute(
        'INSERT INTO follows (follower_id, following_id) VALUES (?, ?)',
        [followerId, targetUserId]
      );

      // ADD NOTIFICATION: User started following you
      await pool.execute(
        'INSERT INTO notifications (user_id, type, source_user_id) VALUES (?, ?, ?)',
        [targetUserId, 'follow', followerId]  // Notify the person being followed
      );

      res.json({ 
        success: true, 
        data: { following: true } 
      });
    }

  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get news feed (posts from users you follow + your own posts)
// Get news feed (fixed version)
// Get news feed (fixed and simplified)
app.get('/api/feed', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    console.log('Fetching feed for user:', userId); // Debug log

    // SIMPLE VERSION - Remove pagination and complex counts for now
    const [posts] = await pool.execute(`
      SELECT 
        p.*, 
        u.username,
        u.email
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = ?
      ) OR p.user_id = ?
      ORDER BY p.created_at DESC
    `, [userId, userId]);

    console.log('Found posts:', (posts as any[]).length); // Debug log

    res.json({
      success: true,
      data: posts
    });

  } catch (error) {
    console.error('Feed error details:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Add comment to a post
app.post('/api/posts/:postId/comments', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = parseInt(req.params.postId);
    const { content } = req.body;
    const userId = req.user!.userId;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)',
      [userId, postId, content]
    );

    const insertResult = result as any;
    
    // Get the created comment with username
    const [comments] = await pool.execute(`
      SELECT c.*, u.username 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.id = ?
    `, [insertResult.insertId]);

    const newComment = (comments as any[])[0];

    // ADD NOTIFICATION: Get post owner to notify them
    const [posts] = await pool.execute('SELECT user_id FROM posts WHERE id = ?', [postId]);
    const post = (posts as any[])[0];

    // Only notify if the post owner is not the one commenting (don't notify yourself)
    if (post.user_id !== userId) {
      await pool.execute(
        'INSERT INTO notifications (user_id, type, source_user_id, post_id) VALUES (?, ?, ?, ?)',
        [post.user_id, 'comment', userId, postId]
      );
    }

    res.status(201).json({
      success: true,
      data: newComment
    });

  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get comments for a post
app.get('/api/posts/:postId/comments', async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.postId);

    const [comments] = await pool.execute(`
      SELECT c.*, u.username 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [postId]);

    res.json({
      success: true,
      data: comments
    });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get notifications for current user
// Get notifications for current user
app.get('/api/notifications', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [notifications] = await pool.execute(`
      SELECT 
        n.*,
        u.username as source_username,
        u.email as source_email,
        p.content as post_content,
        p.id as post_id,
        CASE 
          WHEN n.type = 'follow' THEN CONCAT(u.username, ' started following you')
          WHEN n.type = 'like' THEN CONCAT(u.username, ' liked your post')
          WHEN n.type = 'comment' THEN CONCAT(u.username, ' commented on your post')
          ELSE 'New notification'
        END as message
      FROM notifications n
      LEFT JOIN users u ON n.source_user_id = u.id
      LEFT JOIN posts p ON n.post_id = p.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [userId]);

    res.json({
      success: true,
      data: notifications
    });

  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// Mark notification as read
app.patch('/api/notifications/:notificationId/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notificationId = parseInt(req.params.notificationId);
    const userId = req.user!.userId;

    // Verify the notification belongs to the user
    const [notifications] = await pool.execute(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if ((notifications as any[]).length === 0) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    // Mark as read
    await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE id = ?',
      [notificationId]
    );

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// Admin middleware
const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  
  // Check if user is admin from the token
  if (!req.user.isAdmin) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  
  next();
};

// Admin routes
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [users] = await pool.execute(`
      SELECT id, username, email, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// Start server
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(` Server running on http://localhost:${PORT}`);
      console.log(` Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();