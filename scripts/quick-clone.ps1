param(
  [string]$Repo = "https://github.com/MihailKashintsev/pomidor-ide.git"
)

git clone $Repo
cd pomidor-ide
npm install
Write-Host "Pomidor IDE downloaded. Run: npm start"
