/* global api */

class koes_Naver {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();

        if (locale.indexOf('EN') != -1)
            return 'Korean -> Spanish | Naver Dictionary';

        return 'Coreano -> Español | Naver Dictionary';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;

        let results = await Promise.all([
            this.findNaver(word)
        ]);

        return [].concat(...results).filter(x => x);
    }

    async findNaver(word) {
        let notes = [];

        if (!word)
            return notes;

        function T(node) {
            if (!node)
                return '';

            return node.innerText.trim();
        }

        function H(node) {
            if (!node)
                return '';

            return node.innerHTML.trim();
        }

        /*
         * Naver Korean -> Spanish dictionary
         */
        let base =
            'https://dict.naver.com/eskodict/#/search?query=';

        let url = base + encodeURIComponent(word);

        let doc = '';

        try {
            let data = await api.fetch(url);

            let parser = new DOMParser();

            doc = parser.parseFromString(
                data,
                'text/html'
            );
        } catch (err) {
            return [];
        }

        /*
         * Naver may return several dictionary
         * sections. Try the most common containers.
         */
        let entries = doc.querySelectorAll(
            '.entry, ' +
            '.entry_item, ' +
            '.entry_wrap, ' +
            '.search_result, ' +
            '.component_entry'
        );

        /*
         * If the page does not expose the expected
         * entry classes, try the complete result area.
         */
        if (!entries || entries.length === 0) {
            let container =
                doc.querySelector(
                    '#searchPage_entry, ' +
                    '.dictionary, ' +
                    '.dic_wrap, ' +
                    '#content'
                );

            if (container)
                entries = [container];
        }

        if (!entries || entries.length === 0)
            return notes;

        /*
         * Avoid returning every unrelated result.
         * Normally the first result is the requested
         * dictionary entry.
         */
        let entryCount = Math.min(
            entries.length,
            5
        );

        for (let i = 0; i < entryCount; i++) {

            let entry = entries[i];

            /*
             * Expression / headword
             */
            let expression = '';

            let expressionNode =
                entry.querySelector(
                    '.headword, ' +
                    '.word, ' +
                    '.entry_word, ' +
                    '.tit, ' +
                    '.title'
                );

            if (expressionNode)
                expression = T(expressionNode);

            /*
             * Fallback to searched word.
             */
            if (!expression)
                expression = word;

            expression = expression
                .replace(/\s+/g, ' ')
                .trim();

            /*
             * Reading / pronunciation
             */
            let reading = '';

            let readingNode =
                entry.querySelector(
                    '.pronunciation, ' +
                    '.pron, ' +
                    '.pronunciation_info, ' +
                    '.entry_pron'
                );

            if (readingNode)
                reading = T(readingNode);

            /*
             * Part of speech
             */
            let pos = '';

            let posNode =
                entry.querySelector(
                    '.part_speech, ' +
                    '.pos, ' +
                    '.entry_pos, ' +
                    '.word_class'
                );

            if (posNode)
                pos = T(posNode);

            /*
             * Spanish translations.
             */
            let definitions = [];

            let translationNodes =
                entry.querySelectorAll(
                    '.translation, ' +
                    '.trans, ' +
                    '.mean, ' +
                    '.meaning, ' +
                    '.definition, ' +
                    '.entry_mean'
                );

            for (const node of translationNodes) {

                let text = T(node);

                if (!text)
                    continue;

                /*
                 * Ignore Korean-only content.
                 */
                if (/[\uac00-\ud7a3]/.test(text))
                    continue;

                if (!definitions.includes(text))
                    definitions.push(text);
            }

            /*
             * Fallback: inspect short text elements
             * containing Spanish characters.
             */
            if (definitions.length === 0) {

                let candidates =
                    entry.querySelectorAll(
                        'li, p, span, div'
                    );

                for (const node of candidates) {

                    let text = T(node);

                    if (!text)
                        continue;

                    if (text.length > 300)
                        continue;

                    /*
                     * Spanish text generally contains
                     * Latin characters and does not consist
                     * exclusively of Korean.
                     */
                    if (
                        /[a-záéíóúüñ]/i.test(text) &&
                        !/^[\uac00-\ud7a3\s]+$/.test(text)
                    ) {
                        if (!definitions.includes(text))
                            definitions.push(text);
                    }

                    if (definitions.length >= 10)
                        break;
                }
            }

            /*
             * Examples
             */
            let examples = [];

            let exampleNodes =
                entry.querySelectorAll(
                    '.example, ' +
                    '.example_sentence, ' +
                    '.example_item, ' +
                    '.sentence, ' +
                    '.eg'
                );

            for (const node of exampleNodes) {

                let example = T(node);

                if (!example)
                    continue;

                if (!examples.includes(example))
                    examples.push(example);

                if (
                    examples.length >=
                    this.maxexample
                )
                    break;
            }

            /*
             * Audio
             */
            let audios = [];

            let audioNodes =
                entry.querySelectorAll(
                    'audio, audio source'
                );

            for (const audio of audioNodes) {

                let src =
                    audio.getAttribute('src') ||
                    audio.getAttribute('data-src');

                if (!src)
                    continue;

                if (src.startsWith('//'))
                    src = 'https:' + src;

                if (
                    src.startsWith('/') &&
                    !src.startsWith('//')
                ) {
                    src =
                        'https://dict.naver.com' +
                        src;
                }

                if (!audios.includes(src))
                    audios.push(src);
            }

            /*
             * Extra information.
             */
            let extrainfo = '';

            if (pos) {
                extrainfo =
                    `<span class="pos">${pos}</span>`;
            }

            /*
             * Build definitions.
             */
            let definition = '';

            for (const meaning of definitions) {

                definition +=
                    `<div class="meaning">` +
                    `${meaning}` +
                    `</div>`;
            }

            /*
             * Examples.
             */
            if (
                examples.length > 0 &&
                this.maxexample > 0
            ) {

                definition +=
                    '<ul class="sents">';

                for (
                    let j = 0;
                    j < examples.length &&
                    j < this.maxexample;
                    j++
                ) {

                    let example =
                        examples[j];

                    let highlighted =
                        example.replace(
                            new RegExp(
                                this.escapeRegExp(
                                    expression
                                ),
                                'gi'
                            ),
                            '<b>$&</b>'
                        );

                    definition +=
                        `<li class="sent">` +
                        `<span class="ko_sent">` +
                        `${highlighted}` +
                        `</span>` +
                        `</li>`;
                }

                definition +=
                    '</ul>';
            }

            /*
             * Only return an entry if something
             * meaningful was extracted.
             */
            if (!definition)
                continue;

            notes.push({
                css: this.renderCSS(),
                expression,
                reading,
                extrainfo,
                definitions: [definition],
                audios
            });
        }

        return notes;
    }

    escapeRegExp(value) {
        return value.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        );
    }

    renderCSS() {
        return `
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

            </style>
        `;
    }
}
