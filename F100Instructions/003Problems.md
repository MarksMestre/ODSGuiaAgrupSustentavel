# Problems found
while navegating trought the website I found problems:
1. There is a "Explore o guia" in the top of the side: It needs to be appealing and different from the rest of the side bar for the user to be attracted to the bar;
2. The Chapter don´t have their name on it: I want the content from the source to be extracted in a way that the chapters are written in the side bar instead of "Capítulo 1";
3. In each game, for each Secção, there is a indicative of the age gaps: remove it. Everyon knows what the age gaps are;
4. In the Game Sheets, the hierarchy of text and numeric lists are not preserved. Exs:
    Game 1:
    _________________________________________________________________________________________________________
                |    1. O animador pede ao grupo que construa uma peça de teatro utilizando a                |
                |           informação abaixo apresentada. Sugestão de personagens:                          |
    Instruções  |    2. Zaki - Homem de 50 anos, pequeno agricultor, analfabeto, pai de 4 filhos             |
                |    3. Zaila - Mulher de 48 anos, doméstica e trabalhadora agrícola, analfabeta, mulher de  |
                |           Zaki e mãe de 4 filhos                                                           |
                |    ...                                                                                     |
                |   16. No final, é importante refletir-se sobre as desigualdades existentes, os contrastes  !
                !        e qual o papel de cada um pode ter no combate às desigualdades.                     |
    _________________________________________________________________________________________________________ 

    When it should be:
    _________________________________________________________________________________________________________
                |    1. O animador pede ao grupo que construa uma peça de teatro utilizando a                |
                |           informação abaixo apresentada. Sugestão de personagens:                          |
    Instruções  |       - Zaki - Homem de 50 anos, pequeno agricultor, analfabeto, pai de filhos             |
                |                (bullet point)                                                              |
                |       - Zaila - Mulher de 48 anos, doméstica e trabalhadora agrícola, analfabeta, mulher   |
                |              de Zaki e mãe filhos (bullet point)                                           |
                |    ...                                                                                     |
                |   2. No final, é importante refletir-se sobre as desigualdades existentes, os contrastes   |
                |               e  qual o papel de cada um pode ter no combate às desigualdades.             |
    _________________________________________________________________________________________________________ 

    Game 3:
    _________________________________________________________________________________________________________
                |   1. Parte 1: Definição dos problemas e debate das soluções (15’)                          |
                |   2. A equipa de animação divide a secção em subunidades e distribui uma folha             |
                |               e algumas canetas. Pede-se aos escuteiros para desenhar três colunas do      | 
    Instruções  |               mesmo tamanho na folha.                                                      |
                |   ...                                                                                      |
                |   6. Parte 2: Desenho do mapa. (40’)                                                       |
    _________________________________________________________________________________________________________ 

    When it should be:
    _________________________________________________________________________________________________________
                |   1. Parte 1: Definição dos problemas e debate das soluções (15’)                          |
                |       1. A equipa de animação divide a secção em subunidades e distribui uma folha         |
                |               e algumas canetas. Pede-se aos escuteiros para desenhar três colunas do      | 
    Instruções  |               mesmo tamanho na folha. (nested numeric list)                                |
                |       ...                                                                                  |
                |   2. Parte 2: Desenho do mapa. (40’)                                                       |
    _________________________________________________________________________________________________________ 

    etc.



5. I want to add `\n` [ENTER] in the `Duração e Participantes`row. 
    Example:
    _________________________________________________________________________________
                            |   **Formato:** Presencial ou Online                   |
    Duração e Participantes	|   **Participantes:** Secção organizada em subunidades |
                            |   **Duração:** 60 minutos                             |
    _________________________________________________________________________________

5. The special characters as `**` doesnt have effect in .html files. Actually, the game sheets doesnt follow the design of the actual website. Make them to follow the same ideas




Navegating