const bcrypt = require('bcryptjs');
const hashWithBackslashes = '\\$2b\\$12\\$9EezjwVbLZwCzxU5nwHDBuv6Tx7QKdj065GV.mqdXgPCPdB.IHxGy';
const hashWithoutBackslashes = '$2b$12$9EezjwVbLZwCzxU5nwHDBuv6Tx7QKdj065GV.mqdXgPCPdB.IHxGy';

console.log("Testing with backslashes:");
bcrypt.compare('admin123', hashWithBackslashes).then(console.log).catch(console.error);

console.log("Testing without backslashes:");
bcrypt.compare('admin123', hashWithoutBackslashes).then(console.log).catch(console.error);
