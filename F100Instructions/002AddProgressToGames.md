# Objective:
Add to each Game Card the Paths of the Personal Progress it touches in each Section.

# Info Sources
In the Google Sheets link:
`https://docs.google.com/spreadsheets/d/1RHOm4LJZ0mtMH6yp_9ou5DnDK4uqn7MMJBQXRiBvWrg/edit?usp=sharing`
You will find a Google Sheets that is used by the Scout Leaders to determine if a child/youth as reached specific objetives within their learning path inside a section. 
(NOTE: CNE - Escutismo Católico Português devides the Scouts by age in which:
    1. I Secção: Lobitos; Ages: 6-10; Tipic Color: RGBA(253, 212, 0, 1);
    2. II Secção: Exploradores; Ages: 10-14; Tipic Color: RGBA(63, 165, 53, 1);
    3. III Secção: Pioneiros; Ages: 14-18; Tipic Color: RGBA(0, 160, 230, 1);
    4. IV Secção: Caminheiros; Ages: 18-22 Tipic Color: RGBA(239, 16, 19, 1);
)

You will find a sheets document with different Sheets:
1. 1Sec: Info for I Secção
2. 2Sec: Info for II Secção
3. 3Sec: Info for III Secção
4. 4Sec: Info for IV Secção

If you need more context in explaining the Personal Progress, you can check the different URLs, using the Chrome-DevTools MCP, in headless for me not to see different windows and tabs opening:
1. Caderno de Pista I Secção: A guide to apply the Personal Progress in this Secção: 
https://drive.google.com/file/d/129ouD67XuatPjxL6gdPBVrNkHUVX_3LS/view

2. Caderno de Pista II Secção: A guide to apply the Personal Progress in this Secção: 
https://drive.google.com/file/d/1fMmcDEX1T3NxNyYmwOKr52Bm7LaHaDcT/view

3. Caderno de Pista III Secção: A guide to apply the Personal Progress in this Secção: 
https://drive.google.com/file/d/1cQnvbZdMB3ef8o-C9DTlgp87xAl8ZJmn/view

4. Caderno de Pista IV Secção: A guide to apply the Personal Progress in this Secção: 
https://drive.google.com/file/d/1XeQoyoAPpEQCglDbUEbckLqamIwYNqsj/view

5. Manual do Dirigente: Progresso Pessoal; Explicação da importância deste elemento de avaliação contínua, da forma como o aplicar e a mística por detrás:
https://drive.google.com/file/d/1UU3kkOOKtCqPt7x-rLrcmKrXumwN0mWV/view

# Technical Details
1. The connection between Progress and game needs to be grouped by the following Hierarchy:
Section - Area - Trilho. 
Example:
Game 1
Table:
...
Progresso Pessoal:
I Secção [Using the tipic highlight]
    Físico:
        Trilho X;
        Trilho Y;
        ...
    Afetivo:
        ...
    ...
II Secção [Using the tipic highlight]
    Físico:
        Trilho X;
        Trilho Y;
        ...
    Afetivo:
        ...
    ...
...
2. I don´t want to store data locally. I want the pipeline that generates the connection between games and Personal Progress to search the links that I provided, because info can always change.
3. If this process fails, it cannot put make the whole process of the proj to stop