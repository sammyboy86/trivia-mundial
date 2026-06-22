const bcrypt = require('bcryptjs');
const hash = '$2a$12$LJ3m4ys2Y5YvO7dHzehOHOGKHMKxGEpCmnxvPv1CkR8wLOv08vyWa';
bcrypt.compare('admin123', hash).then(res => console.log("Result:", res)).catch(console.error);
