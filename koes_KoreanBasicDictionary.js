/* global api */

class koes_KoreanBasicDictionary {

    constructor(options) {
        this.options = options || {};
        this.maxexample = 3;
        this.word = '';
    }

    async displayName() {
        return '한국어기초사전 KO→ES';
    }

    setOptions(options) {
        this.options = options || {};

        if (this.options.maxexample) {
            this.maxexample = Number(this.options.maxexample);
        }
    }

    async findTerm(word) {

        this.word = word;

        if (!word || !word.trim()) {
            return [];
        }

        return await this.searchDictionary(word.trim());
    }

    async searchDictionary(word) {

        const url =
            'https://krdict.korean.go.kr/spa/dicSearch/SearchView?word=' +
            encodeURIComponent(word);

        let html;

        try {
            html = await api.fetch(url);
        } catch (error) {
            return [];
        }

        if (!html) {
            return [];
        }

        let doc;

        try {
            const parser = new DOMParser();
            doc = parser.parseFromString(html, 'text/html');
        } catch (error) {
            return [];
        }

        if (!doc || !doc.body) {
            return [];
        }

        const entries = this.findEntries(doc);

        if (!entries.length) {
            return [];
        }

        const results = [];

        for (const entry of entries) {

            const result = this.parseEntry(entry);

            if (result) {
                results.push(result);
            }
        }

        return results;
    }

    /*
     * Locate dictionary entries.
     *
     * NIKL's page contains several blocks, so we first try
     * common entry containers and then use the visible
     * dictionary headings as a fallback.
     */
    findEntries(doc) {

        const selectors = [
            '.word_info',
            '.search_result',
            '.view_cont',
            '.dic_cont',
            '.entry',
            '.result_list'
        ];

        for (const selector of selectors) {

            const nodes = doc.querySelectorAll(selector);

            if (nodes && nodes.length) {
                return Array.from(nodes);
            }
        }

        /*
         * Fallback:
         * locate elements containing "Categoría gramatical".
         */
        const all = doc.querySelectorAll('div, li, section, article');

        const entries = [];

        for (const node of all) {

            const text = this.cleanText(node.innerText);

            if (!text) {
                continue;
            }

            if (
                text.includes('Categoría gramatical') &&
                text.length < 15000
            ) {
                entries.push(node);
            }
        }

        /*
         * Remove nested duplicates.
         */
        return entries.filter((node, index, array) => {

            return !array.some((other, otherIndex) => {

                if (index === otherIndex) {
                    return false;
                }

                return other.contains(node);
            });
        });
    }

    parseEntry(entry) {

        const fullText = this.cleanText(entry.innerText);

        if (!fullText) {
            return null;
        }

        /*
         * Headword
         */
        let expression = this.extractExpression(entry);

        if (!expression) {
            expression = this.word;
        }

        /*
         * Pronunciation
         */
        const reading = this.extractReading(entry);

        /*
         * Part of speech
         */
        const pos = this.extractPartOfSpeech(entry);

        /*
         * Spanish meanings
         */
        const meanings = this.extractMeanings(entry);

        /*
         * Examples
         */
        const examples = this.extractExamples(entry);

        if (!meanings.length && !examples.length) {
            return null;
        }

        let definition = '';

        if (pos) {
            definition +=
                '<div class="koes-pos">' +
                this.escapeHTML(pos) +
                '</div>';
        }

        for (let i = 0; i < meanings.length; i++) {

            definition +=
                '<div class="koes-meaning">' +
                '<span class="koes-number">' +
                (i + 1) +
                '.</span> ' +
                this.escapeHTML(meanings[i]) +
                '</div>';
        }

        if (examples.length) {

            definition +=
                '<div class="koes-examples-title">' +
                'Ejemplos' +
                '</div>';

            for (const example of examples) {

                definition +=
                    '<div class="koes-example">' +
                    this.escapeHTML(example) +
                    '</div>';
            }
        }

        return {
            css: this.renderCSS(),
            expression: expression,
            reading: reading,
            definitions: [definition],
            audios: []
        };
    }

    extractExpression(entry) {

        const selectors = [
            '.word_title',
            '.word_title a',
            '.tit',
            '.tit a',
            '.word',
            '.headword',
            'h3',
            'h4'
        ];

        for (const selector of selectors) {

            const node = entry.querySelector(selector);

            if (!node) {
                continue;
            }

            let value = this.cleanText(node.innerText);

            if (!value) {
                continue;
            }

            /*
             * Remove common dictionary decorations.
             */
            value = value
                .replace(/\s*\([^)]*\)\s*$/, '')
                .replace(/\s*\[\d+\]\s*$/, '')
                .trim();

            if (value.length < 100) {
                return value;
            }
        }

        /*
         * Fallback: first short Korean-looking line.
         */
        const lines = this.getLines(entry);

        for (const line of lines) {

            if (
                /[\uac00-\ud7a3]/.test(line) &&
                line.length < 80 &&
                !line.includes('Categoría') &&
                !line.includes('Pronunciación')
            ) {
                return line;
            }
        }

        return this.word;
    }

    extractReading(entry) {

        const selectors = [
            '.pronunciation',
            '.pron',
            '.pronunciation_info',
            '.pron_info'
        ];

        for (const selector of selectors) {

            const node = entry.querySelector(selector);

            if (node) {

                const value = this.cleanText(node.innerText);

                if (value) {
                    return value
                        .replace(/^Pronunciación\s*/i, '')
                        .trim();
                }
            }
        }

        /*
         * Search text nodes/lines for [ ... ] pronunciation.
         */
        const lines = this.getLines(entry);

        for (const line of lines) {

            if (
                line.includes('Pronunciación') &&
                /\[[^\]]+\]/.test(line)
            ) {

                const match = line.match(/\[([^\]]+)\]/);

                if (match) {
                    return match[1].trim();
                }
            }
        }

        return '';
    }

    extractPartOfSpeech(entry) {

        const lines = this.getLines(entry);

        for (const line of lines) {

            if (
                line.toLowerCase()
                    .includes('categoría gramatical')
            ) {

                /*
                 * Usually:
                 *
                 * Categoría gramatical
                 * 「명사」 Sustantivo
                 */
                const index = lines.indexOf(line);

                if (index !== -1 && lines[index + 1]) {
                    return lines[index + 1].trim();
                }
            }
        }

        /*
         * Direct selector fallback.
         */
        const selectors = [
            '.pos',
            '.part',
            '.word_type',
            '.word_pos'
        ];

        for (const selector of selectors) {

            const node = entry.querySelector(selector);

            if (node) {

                const value = this.cleanText(node.innerText);

                if (value) {
                    return value;
                }
            }
        }

        return '';
    }

    extractMeanings(entry) {

        const lines = this.getLines(entry);

        const meanings = [];

        let categoryFound = false;
        let lookingForMeaning = false;

        for (let i = 0; i < lines.length; i++) {

            const line = lines[i];

            if (
                line.toLowerCase()
                    .includes('categoría gramatical')
            ) {
                categoryFound = true;
                continue;
            }

            if (!categoryFound) {
                continue;
            }

            /*
             * Stop when examples start.
             */
            if (
                line.startsWith('Ejemplo') ||
                line.startsWith('Estructura') ||
                line.startsWith('Palabra original') ||
                line.startsWith('Ver más')
            ) {
                break;
            }

            /*
             * A Spanish translation usually follows
             * the grammatical-category section.
             *
             * We ignore Korean definition sentences.
             */
            if (
                this.isSpanishText(line) &&
                !this.isInterfaceText(line) &&
                line.length < 500
            ) {

                if (!meanings.includes(line)) {
                    meanings.push(line);
                }
            }
        }

        /*
         * The first Spanish lines after POS are generally
         * the actual translations.
         *
         * Limit excessive page text.
         */
        return meanings.slice(0, 20);
    }

    extractExamples(entry) {

        const examples = [];

        const lines = this.getLines(entry);

        let started = false;

        for (const line of lines) {

            if (
                line === 'Ejemplos' ||
                line.startsWith('Ejemplo')
            ) {
                started = true;
                continue;
            }

            if (!started) {
                continue;
            }

            if (
                line.startsWith('Estructura') ||
                line.startsWith('Sinónimo') ||
                line.startsWith('Antónimo') ||
                line.startsWith('Palabra original') ||
                line.startsWith('Ver más')
            ) {
                break;
            }

            /*
             * Keep Korean example sentences.
             */
            if (
                /[\uac00-\ud7a3]/.test(line) &&
                line.length < 300 &&
                !examples.includes(line)
            ) {

                examples.push(line);
            }

            if (examples.length >= this.maxexample) {
                break;
            }
        }

        return examples;
    }

    getLines(entry) {

        if (!entry) {
            return [];
        }

        return entry.innerText
            .split(/\n+/)
            .map(x => this.cleanText(x))
            .filter(Boolean);
    }

    cleanText(value) {

        if (!value) {
            return '';
        }

        return value
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    isSpanishText(text) {

        if (!text) {
            return false;
        }

        /*
         * Korean definition text normally contains Hangul.
         * Spanish translations generally don't.
         */
        const koreanCharacters =
            (text.match(/[\uac00-\ud7a3]/g) || []).length;

        if (koreanCharacters > 0) {
            return false;
        }

        /*
         * Ignore navigation/UI strings.
         */
        return /[a-záéíóúüñ]/i.test(text);
    }

    isInterfaceText(text) {

        const ignored = [
            'Pronunciación',
            'Categoría gramatical',
            'Palabra derivada',
            'Sinónimo',
            'Antónimo',
            'Estructura oracional',
            'Palabra original',
            'Ver más',
            'Descargar',
            'Imprimir',
            'Buscar',
            'Borrar'
        ];

        return ignored.some(x =>
            text.toLowerCase() === x.toLowerCase()
        );
    }

    escapeHTML(value) {

        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    renderCSS() {

        return `
<style>

.koes-pos {
    display: inline-block;
    margin: 2px 0 8px 0;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.85em;
    font-weight: 600;
    opacity: 0.85;
}

.koes-meaning {
    margin: 4px 0;
    line-height: 1.45;
}

.koes-number {
    font-weight: bold;
}

.koes-examples-title {
    margin-top: 12px;
    margin-bottom: 5px;
    font-weight: bold;
}

.koes-example {
    margin: 5px 0;
    padding-left: 8px;
    line-height: 1.45;
}

</style>
`;
    }
}
