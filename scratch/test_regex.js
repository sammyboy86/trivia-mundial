const hashWithBackslashes = '\\$2b\\$12\\$9EezjwVbLZwCzxU5nwHDBuv6Tx7QKdj065GV.mqdXgPCPdB.IHxGy';
const hashWithQuotes = "'$2b$12$9EezjwVbLZwCzxU5nwHDBuv6Tx7QKdj065GV.mqdXgPCPdB.IHxGy'";

const cleanHash1 = hashWithBackslashes.replace(/^['"]|['"]$/g, '').replace(/\\\$/g, '$');
const cleanHash2 = hashWithQuotes.replace(/^['"]|['"]$/g, '').replace(/\\\$/g, '$');

console.log("cleanHash1:", cleanHash1);
console.log("cleanHash2:", cleanHash2);
