const fs = require('fs');
fetch('http://localhost:3000/api/admin/questions')
  .then(res => res.json())
  .then(data => {
    const tf = data.questions.filter(q => q.question_type === 'true_false');
    console.log(tf.map(q => q.correct_option));
  });
