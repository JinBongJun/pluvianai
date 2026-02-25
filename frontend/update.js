const fs = require('fs');
const file = 'c:/Users/user/Desktop/AgentGuard/frontend/components/live-view/ClinicalLog.tsx';
const target = 'c:/Users/user/Desktop/AgentGuard/frontend/temp_layout.txt';

try {
    let lines = fs.readFileSync(file, 'utf8').split('\n');

    const startIndex = lines.findIndex(l => l.includes('<div className="p-6 space-y-6">'));
    if (startIndex === -1) {
        console.log('Failed to find start block');
        process.exit(1);
    }

    let endIndex = -1;
    let openDivs = 0;
    for (let i = startIndex; i < lines.length; i++) {
        if (lines[i].includes('<div')) openDivs += (lines[i].match(/<div/g) || []).length;
        if (lines[i].includes('</div')) openDivs -= (lines[i].match(/<\/div/g) || []).length;

        if (openDivs === 0) {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        console.log('Failed to find end block');
        process.exit(1);
    }

    const newLayout = fs.readFileSync(target, 'utf8');

    lines.splice(startIndex, endIndex - startIndex + 1, newLayout);
    fs.writeFileSync(file, lines.join('\n'));
    console.log('Successfully replaced lines ' + startIndex + ' to ' + endIndex);
} catch (e) {
    console.error(e);
    process.exit(1);
}
