/* global api */

class koes_KoreanBasicDictionary {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();

        if (locale.indexOf('EN') != -1)
            return 'Korean -> Spanish | Korean Basic Dictionary';

        return 'Coreano -> Español | 한국어기초사전';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;

        let results = await Promise.all([
            this.findKoreanBasic(word)
        ]);

        return [].concat(...results).filter(x => x);
    }

    async findKoreanBasic(word) {
        let notes = [];

        if (!word)
            return notes;

        function T(node) {
            if (!node)
                return '';

            return node.innerText.trim();
        }

        /*
         * Korean Basic Dictionary
         * Spanish interface
         */
        let base =
            'https://krdict.korean.go.kr/spa/dicSearch/SearchView?word=';

        let url = base + encodeURIComponent(word);

        let doc = '';

        try {
            let data = await api.fetch(url);

            let parser = new DOMParser();

            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        /*
         * Dictionary entry
         *
         * NIKL pages contain the result inside
         * the word information area.
         */
        let dictionary =
            doc.querySelector('.word_info') ||
            doc.querySelector('.search_result') ||
            doc.querySelector('.view_cont') ||
            doc.querySelector('.dic_cont');

        if (!dictionary)
            return notes;

        /*
         * Expression
         */
        let expression = '';

        let expressionNode =
            dictionary.querySelector('.word_title') ||
            dictionary.querySelector('.word_title a') ||
            dictionary.querySelector('.tit') ||
            dictionary.querySelector('.tit a') ||
            dictionary.querySelector('.word');

        if (expressionNode)
            expression = T(expressionNode);

        /*
         * Fallback to searched word
         */
        if (!expression)
            expression = word;

        /*
         * Remove Chinese characters / dictionary
         * numbering from the expression.
         *
         * Example:
         * 학교 (學校)
         */
        expression = expression
            .replace(/\s*\([^)]*\)/g, '')
            .replace(/\s*\^\{\d+\}/g, '')
            .trim();

        /*
         * Pronunciation
         */
        let reading = '';

        let pronunciation =
            dictionary.querySelector('.pronunciation') ||
            dictionary.querySelector('.pron') ||
            dictionary.querySelector('.pronunciation_info') ||
            dictionary.querySelector('.pron_info');

        if (pronunciation) {
            reading = T(pronunciation);

            reading = reading
                .replace(/^Pronunciación\s*/i, '')
                .replace(/^\[/, '')
                .replace(/\]$/, '')
                .replace(/\s*듣기.*$/i, '')
                .trim();
        }

        /*
         * Part of speech
         */
        let pos = '';

        let posNodes = dictionary.querySelectorAll('.pos');

        if (posNodes && posNodes.length > 0) {
            pos = T(posNodes[0]);
        }

        /*
         * The Spanish page normally displays:
         *
         * Categoría gramatical
         * 「명사」 Sustantivo
         *
         * So we also look through the visible text.
         */
        if (!pos) {
            let lines = dictionary.innerText
                .split(/\n+/)
                .map(x => x.trim())
                .filter(Boolean);

            for (let i = 0; i < lines.length; i++) {
                if (
                    lines[i]
                        .toLowerCase()
                        .includes('categoría gramatical')
                ) {
                    if (lines[i + 1]) {
                        pos = lines[i + 1];
                        break;
                    }
                }
            }
        }

        /*
         * Spanish translations
         */
        let definitions = [];

        /*
         * Look for the main Spanish meaning blocks.
         */
        let meaningSelectors = [
            '.sense_translation',
            '.translation',
            '.trans_word',
            '.mean',
            '.meaning',
            '.definition'
        ];

        let meaningNodes = [];

        for (const selector of meaningSelectors) {
            let nodes = dictionary.querySelectorAll(selector);

            if (nodes && nodes.length > 0) {
                meaningNodes = Array.from(nodes);
                break;
            }
        }

        /*
         * If selectors are not available, parse the
         * visible Spanish text after "Categoría gramatical".
         */
        if (meaningNodes.length === 0) {
            let lines = dictionary.innerText
                .split(/\n+/)
                .map(x => x.trim())
                .filter(Boolean);

            let categoryFound = false;

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];

                if (
                    line
                        .toLowerCase()
                        .includes('categoría gramatical')
                ) {
                    categoryFound = true;
                    continue;
                }

                if (!categoryFound)
                    continue;

                /*
                 * Stop before the Korean definition/examples.
                 */
                if (
                    /[\uac00-\ud7a3]/.test(line)
                ) {
                    continue;
                }

                if (
                    line === 'Ejemplos' ||
                    line.startsWith('Ejemplo') ||
                    line.startsWith('Palabra de referencia') ||
                    line.startsWith('Sinónimo') ||
                    line.startsWith('Antónimo') ||
                    line.startsWith('Palabra original') ||
                    line.startsWith('Ver más')
                ) {
                    break;
                }

                /*
                 * Avoid interface text.
                 */
                if (
                    line === 'Pronunciación' ||
                    line === 'Categoría gramatical'
                ) {
                    continue;
                }

                /*
                 * Spanish translation
                 */
                if (
                    /[a-záéíóúüñ]/i.test(line) &&
                    line.length < 300
                ) {
                    if (!definitions.includes(line)) {
                        definitions.push(line);
                    }
                }

                /*
                 * The first few Spanish lines are generally
                 * the actual translations.
                 */
                if (definitions.length >= 20)
                    break;
            }
        } else {
            for (const node of meaningNodes) {
                let meaning = T(node);

                if (
                    meaning &&
                    !definitions.includes(meaning)
                ) {
                    definitions.push(meaning);
                }
            }
        }

        /*
         * Examples
         *
         * The Spanish NIKL page contains Korean example
         * sentences after the translations.
         */
        let examples = [];

        let exampleSelectors = [
            '.example',
            '.example_sentence',
            '.sentence',
            '.ex'
        ];

        for (const selector of exampleSelectors) {
            let nodes = dictionary.querySelectorAll(selector);

            if (nodes && nodes.length > 0) {
                for (const node of nodes) {
                    let example = T(node);

                    if (
                        example &&
                        !examples.includes(example)
                    ) {
                        examples.push(example);
                    }

                    if (examples.length >= this.maxexample)
                        break;
                }

                break;
            }
        }

        /*
         * Fallback: search visible lines for Korean
         * sentences after the first Spanish meanings.
         */
        if (examples.length === 0) {
            let lines = dictionary.innerText
                .split(/\n+/)
                .map(x => x.trim())
                .filter(Boolean);

            let meaningStarted = false;

            for (const line of lines) {

                if (
                    /[a-záéíóúüñ]/i.test(line) &&
                    !/[\uac00-\ud7a3]/.test(line)
                ) {
                    if (
                        line.length < 300 &&
                        !line.startsWith('Categoría') &&
                        !line.startsWith('Pronunciación')
                    ) {
                        meaningStarted = true;
                    }

                    continue;
                }

                if (!meaningStarted)
                    continue;

                /*
                 * Korean example sentence
                 */
                if (
                    /[\uac00-\ud7a3]/.test(line) &&
                    line.length < 300
                ) {
                    /*
                     * Ignore dictionary metadata.
                     */
                    if (
                        line.includes('유의어') ||
                        line.includes('반의어') ||
                        line.includes('원어') ||
                        line.includes('문형')
                    ) {
                        continue;
                    }

                    if (!examples.includes(line)) {
                        examples.push(line);
                    }
                }

                if (examples.length >= this.maxexample)
                    break;
            }
        }

        /*
         * Extra information
         */
        let extrainfo = '';

        if (pos) {
            extrainfo =
                `<span class="pos">${pos}</span>`;
        }

        /*
         * Build definition
         */
        let definition = '';

        for (const meaning of definitions) {
            definition +=
                `<div class="meaning">${meaning}</div>`;
        }

        /*
         * Examples
         */
        if (
            examples.length > 0 &&
            this.maxexample > 0
        ) {
            definition += '<ul class="sents">';

            for (
                let index = 0;
                index < examples.length &&
                index < this.maxexample;
                index++
            ) {
                let example = examples[index];

                /*
                 * Highlight the searched expression
                 */
                let highlighted = example.replace(
                    new RegExp(
                        this.escapeRegExp(expression),
                        'gi'
                    ),
                    '<b>$&</b>'
                );

                definition +=
                    `<li class="sent">` +
                    `<span class="ko_sent">` +
                    highlighted +
                    `</span>` +
                    `</li>`;
            }

            definition += '</ul>';
        }

        /*
         * Audio
         */
        let audios = [];

        let audio =
            dictionary.querySelector('audio') ||
            dictionary.querySelector('audio source');

        if (audio) {
            let audioURL =
                audio.getAttribute('src') ||
                audio.getAttribute('data-src');

            if (audioURL) {

                if (audioURL.startsWith('//')) {
                    audioURL = 'https:' + audioURL;
                }

                else if (audioURL.startsWith('/')) {
                    audioURL =
                        'https://krdict.korean.go.kr' +
                        audioURL;
                }

                audios.push(audioURL);
            }
        }

        /*
         * If no definition was found, don't return
         * an empty dictionary entry.
         */
        if (!definition)
            return notes;

        /*
         * CSS
         */
        let css = this.renderCSS();

        /*
         * ODH result object
         */
        notes.push({
            css,
            expression,
            reading,
            extrainfo,
            definitions: [definition],
            audios
        });

        return notes;
    }

    escapeRegExp(value) {
        return value.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        );
    }

    renderCSS() {
        let css = `
            <style>

                span.pos {
                    display:inline-block;
                    font-size:0.85em;
                    margin-right:5px;
                    padding:2px 6px;
                    color:white;
                    background-color:#0d47a1;
                    border-radius:4px;
                }

                div.meaning {
                    margin:4px 0;
                    line-height:1.45;
                }

                ul.sents {
                    font-size:0.85em;
                    list-style:square inside;
                    margin:8px 0;
                    padding:7px 10px;
                    background:rgba(13,71,161,0.08);
                    border-radius:5px;
                }

                li.sent {
                    margin:4px 0;
                    padding:0;
                }

                span.ko_sent {
                    line-height:1.45;
                }

            </style>`;

        return css;
    }
}
