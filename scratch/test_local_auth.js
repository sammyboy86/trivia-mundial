const bcrypt = require('bcryptjs');
const rawHash = '$2b$12$9EezjwVbLZwCzxU5nwHDBuv6Tx7QKdj065GV.mqdXgPCPdB.IHxGy';

const cleanHash = rawHash?.replace(/^['"]|['"]$/g, '')?.replace(/\\\$/g, '$');

console.log("Raw Hash:", rawHash);
console.log("Clean Hash:", cleanHash);

bcrypt.compare('admin123', cleanHash).then(res => console.log("Valid:", res)).catch(console.error);
