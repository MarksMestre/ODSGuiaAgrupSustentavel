I want to create a interactive, attractive and easy-to-use plataform from the content inside de `\source\source1.docx`, `\source\source2.docx`  and `\source\gamesSource.docx`, in which:
The site is going to be a kit for `Agrupamentos` of `CNE - Escutismo Católico Português`, to learn more and apply sustainability development goals in their reality.
1. Source1: is the first part of the content;
2. Source2: is the second part of the content;

These 2 first files, as a whole, declare the content without the games. That part will be available in the gamesSource file

3. GamesSource: A docx file with info about 30 games ready to apply in each Agrupamento.

You need to use a `navbar` for easy navegation on the site

For `Section 6 - Jogos e Workshops` games, you need to:
1. Using the content: `\source\gamesSource.docx`, create a game sheet using `\source\games\00GameSheetTemplate.docx`, for each game;
2. Dump the Game Sheet in `\source\games\{n}Game.{extension}`, in which n: int in [0,30] representing the n game and extension is the extension of the file (choose the most adequate format for this task).
NOTE: This process need to be modular using `.py` scripts, needs the run before the construction of the actual site and needs to be prepared for me to add or change content later on and to be user-friendly this interaction with people that don´t know how to code.
This section needs to be also navegable in the `navbar` of the site.

Ignore section 7 - Influencers for the final site.

Respect the site stack and implementation already estabelished.