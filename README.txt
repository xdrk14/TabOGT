TABOGT - SETUP

INSTALL (any laptop, from Google Drive)
1. Install Google Drive for desktop and sign in.
2. In Drive, right-click the TabOgt folder > Offline access > Available offline.
   (Brave needs the files on this computer. The "tests" folder is not needed and can be left out.)
3. Open brave://extensions and switch on "Developer mode" (top right).
4. Click "Load unpacked" and select the TabOgt folder (the one containing manifest.json).
5. Open a new tab. If Brave asks whether to keep the new tab change, choose Keep.
6. Click the puzzle icon in the toolbar and pin TabOgt.

UPDATING: when the files in Drive change, click the reload arrow on the TabOgt card in brave://extensions.

SYNC BETWEEN LAPTOPS (free, through your own private GitHub repository)
1. github.com > New repository > name it e.g. tabogt-data > choose Private > Create.
2. github.com > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.
   - Repository access: Only select repositories > tabogt-data
   - Permissions > Repository permissions > Contents: Read and write
   - Generate, then copy the token (it starts with github_pat_).
3. In TabOgt: Customise > Sync > Repository: yourname/tabogt-data, Access token: paste > Connect.
4. On the next laptop do step 3 again (same token is fine, or make one per laptop) and choose "Use GitHub data".
Changes upload a few seconds after you make them; other laptops pull on each new tab and every 5 minutes.
Edits made on two laptops at once are merged. When the token expires, make a new one and reconnect.
The token is stored only in this browser. It is not in backups or in the synced file.

BACKUP: Customise > Your data > Back up (JSON). Do this before removing the extension.
