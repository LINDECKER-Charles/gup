# screenshots-in-english

## Documentation

- The screenshots show the interface in English, now gup's default language: the 24 terminal
  screenshots with their titles and alt texts, the gallery page, and the HTML report's picture,
  which `npm run screenshots:report` already asked for in English but which had not been taken
  again since (`docs: regenerate the screenshots in English`)

## Internal

- **chore:** The screenshot generator renders in English, the docs' language, which it now
  chooses before any scene loads instead of taking whatever the process speaks. Scenes wait for
  the labels the app renders, read from its catalogs as they play, instead of French literals a
  label change broke. The fixture machine shows what an English Windows shows: winget's English
  output and size format, the failed Scoop scan, the schedules' name and failure, the Journal's
  messages. The JOURNAL scene's cursor is back on the debug log's row, one lower since BEHAVIOR
  opens on Language, and the scene now checks the cursor's mark: an English hint stands beside
  its row wherever the cursor is, so the hint alone no longer proved the row
  (`chore: capture the screenshots in English`)
