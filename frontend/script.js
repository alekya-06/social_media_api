// ========= GLOBAL STATE =========
let token = '';
let currentUser = null;
const API_BASE = '/api';

// ========= API UTILITIES =========
async function makeRequest(url, method, body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE}${url}`, options);
        const data = await response.json();
        return data;
    } catch (error) {
        return { 
            success: false, 
            error: error.message 
        };
    }
}

function displayResponse(elementId, result) {
    const element = document.getElementById(elementId);
    
    if (!element) return; // Skip if element doesn't exist on current page
    
    if (result.success) {
        element.style.borderLeft = '4px solid #10B981';
        element.style.background = '#ECFDF5';
        
        // Clean up the display for success responses
        if (result.data && result.data.token) {
            element.innerHTML = `
✅ <strong>Success!</strong>
📝 Response: ${JSON.stringify({
    success: result.success,
    user: result.data.user,
    token: result.data.token ? '***' + result.data.token.slice(-10) : 'None'
}, null, 2)}
`;
        } else {
            element.innerHTML = `✅ <strong>Success!</strong>\n` + JSON.stringify(result, null, 2);
        }
    } else {
        element.style.borderLeft = '4px solid #EF4444';
        element.style.background = '#FEF2F2';
        element.innerHTML = `❌ <strong>Error:</strong>\n` + JSON.stringify(result, null, 2);
    }
    
    element.style.display = 'block';
}

function updateUserInfo() {
    // This will be called from auth pages to show login status
    console.log('User logged in:', currentUser);
}

// ========= AUTHENTICATION FUNCTIONS =========
async function register() {
    const userData = {
        username: document.getElementById('regUsername').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value
    };
    
    const result = await makeRequest('/auth/register', 'POST', userData);
    displayResponse('registerResponse', result);
    
    if (result.success) {
        token = result.data.token;
        currentUser = result.data.user;
        localStorage.setItem('token', token);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateUserInfo();
        
        // Redirect to home page after successful registration
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }
}

async function login() {
    const loginData = {
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
    };
    
    const result = await makeRequest('/auth/login', 'POST', loginData);
    displayResponse('loginResponse', result);
    
    if (result.success) {
        token = result.data.token;
        currentUser = result.data.user;
        localStorage.setItem('token', token);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateUserInfo();
        
        // Redirect to home page after successful login
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }
}

function logout() {
    token = '';
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    window.location.href = 'auth.html';
}

// ========= USER FUNCTIONS =========
async function getUserProfile() {
    const userId = document.getElementById('profileUserId').value;
    const result = await makeRequest(`/users/${userId}`, 'GET');
    displayResponse('userProfileResponse', result);
}

async function followUser() {
    const userId = document.getElementById('followUserId').value;
    const result = await makeRequest(`/users/${userId}/follow`, 'POST', {});
    displayResponse('userProfileResponse', result);
}

// ========= POST FUNCTIONS =========
async function createPost() {
    const content = document.getElementById('postContent').value;
    const result = await makeRequest('/posts', 'POST', { content });
    displayResponse('postsResponse', result);
}

async function getAllPosts() {
    const page = 1; // Simple version for now
    const limit = 50;
    const result = await makeRequest(`/posts?page=${page}&limit=${limit}`, 'GET');
    displayResponse('postsResponse', result);
}

// ========= FEED FUNCTIONS =========
async function getNewsFeed() {
    const page = 1; // Simple version for now
    const limit = 50;
    const result = await makeRequest(`/feed?page=${page}&limit=${limit}`, 'GET');
    displayResponse('feedResponse', result);
}

// ========= COMMENT & LIKE FUNCTIONS =========
async function addComment() {
    const postId = document.getElementById('postIdForComment').value;
    const content = document.getElementById('commentContent').value;
    const result = await makeRequest(`/posts/${postId}/comments`, 'POST', { content });
    displayResponse('commentsResponse', result);
}

async function likePost() {
    const postId = document.getElementById('postIdForLike').value;
    const result = await makeRequest(`/posts/${postId}/like`, 'POST', {});
    displayResponse('commentsResponse', result);
}

async function getComments() {
    const postId = document.getElementById('postIdForComment').value;
    const result = await makeRequest(`/posts/${postId}/comments`, 'GET');
    displayResponse('commentsResponse', result);
}

// ========= NOTIFICATION FUNCTIONS =========
async function getNotifications() {
    const result = await makeRequest('/notifications', 'GET');
    displayResponse('notificationsResponse', result);
}

// ========= INITIALIZATION =========
function initializeApp() {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedToken && savedUser) {
        token = savedToken;
        currentUser = JSON.parse(savedUser);
        console.log('User restored from localStorage:', currentUser);
    }
}

initializeApp();