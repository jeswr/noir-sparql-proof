import fs from 'fs';

// Read timing data
let timingData;
try {
  timingData = JSON.parse(fs.readFileSync('./temp/timing.json', 'utf8'));
} catch (error) {
  console.log('No timing data found, using placeholder');
  timingData = { provingTimeFormatted: 'Not yet measured', timestamp: null };
}

// Read README
const readmeContent = fs.readFileSync('./README.md', 'utf8');

// Create timing section
const timingSection = `## Performance

**Latest Proof Generation Time**: ${timingData.provingTimeFormatted}  
*Last measured: ${timingData.timestamp ? new Date(timingData.timestamp).toLocaleString() : 'Not yet run'}*

`;

// Check if performance section already exists
const performanceRegex = /## Performance[\s\S]*?(?=\n## |\n---|\Z)/;

if (performanceRegex.test(readmeContent)) {
  // Replace existing performance section
  const updatedContent = readmeContent.replace(performanceRegex, timingSection.trim());
  fs.writeFileSync('./README.md', updatedContent);
} else {
  // Add performance section before "Project Structure"
  const projectStructureIndex = readmeContent.indexOf('## Project Structure');
  if (projectStructureIndex !== -1) {
    const beforeSection = readmeContent.substring(0, projectStructureIndex);
    const afterSection = readmeContent.substring(projectStructureIndex);
    const updatedContent = beforeSection + timingSection + afterSection;
    fs.writeFileSync('./README.md', updatedContent);
  } else {
    // Add at the end if no Project Structure section found
    const updatedContent = readmeContent + '\n' + timingSection;
    fs.writeFileSync('./README.md', updatedContent);
  }
}

console.log('README updated with latest timing information');
