const http = require('http');

async function run() {
  const qs = [];
  for(let i = 0; i < 850; i++) {
    qs.push({
      question_text: "Test question " + i,
      question_type: "multiple_choice",
      correct_answer: "a",
      options: { a: "A", b: "B", c: "C", d: "D" }
    });
  }

  const payload = JSON.stringify({ questions: qs });
  console.log("Payload size:", payload.length);

  const req = http.request("http://localhost:3000/api/admin/questions/bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": payload.length
      // Note: without auth cookie, this should return 401 Unauthorized, not 400.
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log(res.statusCode, body));
  });

  req.write(payload);
  req.end();
}
run();
