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
        
        // Log for debugging
        if (!response.ok) {
            console.error(`API Error (${response.status}):`, data);
        }
        
        return data;
    } catch (error) {
        console.error('Network error:', error);
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
 <strong>Success!</strong>
 Response: ${JSON.stringify({
    success: result.success,
    user: result.data.user,
    token: result.data.token ? '***' + result.data.token.slice(-10) : 'None'
}, null, 2)}
`;
        } else if (result.message) {
            // For simple success messages (like in admin functions)
            element.innerHTML = ` <strong>${result.message}</strong>`;
        } else {
            element.innerHTML = ` <strong>Success!</strong>\n` + JSON.stringify(result, null, 2);
        }
    } else {
        element.style.borderLeft = '4px solid #EF4444';
        element.style.background = '#FEF2F2';
        
        // Special handling for admin access denied
        if (result.error && result.error.includes('Admin access required')) {
            element.innerHTML = ` <strong>Admin Access Required</strong><br>
            You need administrator privileges to access this feature.`;
        } else {
            element.innerHTML = ` <strong>Error:</strong>\n` + JSON.stringify(result, null, 2);
        }
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

// ========= ADMIN FUNCTIONS =========
async function getAllUsers() {
    const page = document.getElementById('adminPage')?.value || 1;
    const limit = document.getElementById('adminLimit')?.value || 20;
    
    console.log(`Fetching admin users - page ${page}, limit ${limit}`);
    
    const result = await makeRequest(`/admin/users?page=${page}&limit=${limit}`, 'GET');
    
    console.log('Admin users response:', result);
    
    if (result.success) {
        displayUsersTable(result);
        displayResponse('adminUsersResponse', {
            success: true,
            message: `Found ${result.pagination.total_items} users`
        });
    } else {
        displayResponse('adminUsersResponse', result);
        const container = document.getElementById('usersTableContainer');
        if (container) container.style.display = 'none';
    }
}

function displayUsersTable(result) {
    const container = document.getElementById('usersTableContainer');
    const tbody = document.getElementById('usersTableBody');
    const pagination = document.getElementById('paginationControls');
    
    if (!container || !tbody) return;
    
    if (!result.data || result.data.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    // Populate table with users
    result.data.forEach(user => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';
        row.innerHTML = `
            <td style="padding: 10px; border: 1px solid #ddd;">${user.id}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">
                <strong>${user.username}</strong>
            </td>
            <td style="padding: 10px; border: 1px solid #ddd;">${user.email}</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">
                ${user.is_admin ? '✅' : '❌'}
            </td>
            <td style="padding: 10px; border: 1px solid #ddd; font-size: 12px;">
                ${new Date(user.created_at).toLocaleDateString()}
            </td>
        `;
        tbody.appendChild(row);
    });
    
    // Update pagination info
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Page ${result.pagination.current_page} of ${result.pagination.total_pages} (${result.pagination.total_items} total users)`;
    }
    
    // Enable/disable pagination buttons
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    if (prevButton) prevButton.disabled = !result.pagination.has_prev;
    if (nextButton) nextButton.disabled = !result.pagination.has_next;
    
    // Show the table
    container.style.display = 'block';
}

function changePage(direction) {
    const currentPage = parseInt(document.getElementById('adminPage')?.value) || 1;
    const newPage = currentPage + direction;
    
    if (newPage >= 1) {
        document.getElementById('adminPage').value = newPage;
        getAllUsers();
    }
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
        
        // Show admin section if user is admin
        if (currentUser && currentUser.is_admin) {
            const adminSection = document.getElementById('adminSection');
            if (adminSection) {
                adminSection.style.display = 'block';
                console.log('Admin access granted');
                
                // Load users automatically for admin
                getAllUsers();
            }
        }
    }
}

initializeApp();