const fs = require('fs');

const files = [
  'app/admin/dashboard/page.tsx',
  'app/admin/dashboard/components/QuestionsTab.tsx',
  'app/admin/dashboard/components/MarkdownUploadTab.tsx',
  'app/admin/dashboard/components/ImportTab.tsx',
  'app/admin/dashboard/components/Modals/ExtractionModal.tsx',
  'app/admin/dashboard/components/Modals/PostProcessModal.tsx',
  'app/admin/dashboard/components/Modals/QuestionModal.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/\\\$\{/g, '${');
    fs.writeFileSync(f, content);
  }
});
console.log('Fixed interpolation');
