const fs = require('node:fs')
const path = require('node:path')

const outputDir = path.join(__dirname, '_site')
const assetsDir = path.join(outputDir, 'assets')
const siteFiles = ['index.html', 'app.js', 'aws-config.js', 'style.css']

fs.mkdirSync(assetsDir, {recursive: true})

for(const file of siteFiles){
	fs.copyFileSync(path.join(__dirname, file), path.join(outputDir, file))
}

fs.cpSync(path.join(__dirname, 'assets'), assetsDir, {recursive: true})
