#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdbool.h>
#include <errno.h>

#ifndef POMIDOR_VERSION
#define POMIDOR_VERSION "0.4.1"
#endif
#define POMIDOR_REPO "MihailKashintsev/pomidor-c"

static size_t g_allocs = 0;
static size_t g_frees = 0;

static int version_part(const char **p) {
    while (**p == 'v' || **p == 'V' || **p == ' ' || **p == '.') (*p)++;
    int n = 0;
    while (isdigit((unsigned char)**p)) { n = n * 10 + (**p - '0'); (*p)++; }
    return n;
}

static int compare_versions(const char *a, const char *b) {
    for (int i = 0; i < 3; i++) {
        int pa = version_part(&a);
        int pb = version_part(&b);
        if (pa < pb) return -1;
        if (pa > pb) return 1;
    }
    return 0;
}

static char *read_whole_file_plain(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    if (fseek(f, 0, SEEK_END) != 0) { fclose(f); return NULL; }
    long size = ftell(f);
    if (size < 0) { fclose(f); return NULL; }
    rewind(f);
    char *buf = (char *)malloc((size_t)size + 1);
    if (!buf) { fclose(f); return NULL; }
    size_t got = fread(buf, 1, (size_t)size, f);
    buf[got] = '\0';
    fclose(f);
    return buf;
}

static int run_command_plain(const char *cmd) {
    return system(cmd);
}

static const char *temp_json_path(void) {
#ifdef _WIN32
    return "%TEMP%\\pomidor_latest.json";
#else
    return "/tmp/pomidor_latest.json";
#endif
}

static const char *temp_json_read_path(void) {
#ifdef _WIN32
    const char *tmp = getenv("TEMP");
    static char path[512];
    snprintf(path, sizeof(path), "%s\\pomidor_latest.json", tmp ? tmp : ".");
    return path;
#else
    return "/tmp/pomidor_latest.json";
#endif
}

static bool fetch_latest_json(void) {
    char cmd[1024];
#ifdef _WIN32
    snprintf(cmd, sizeof(cmd), "curl -L -s https://api.github.com/repos/%s/releases/latest -o \"%s\"", POMIDOR_REPO, temp_json_path());
#else
    snprintf(cmd, sizeof(cmd), "curl -L -s https://api.github.com/repos/%s/releases/latest -o '%s'", POMIDOR_REPO, temp_json_path());
#endif
    return run_command_plain(cmd) == 0;
}

static bool extract_json_string(const char *json, const char *key, char *out, size_t out_size) {
    char pattern[128];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *p = strstr(json, pattern);
    if (!p) return false;
    p = strchr(p, ':');
    if (!p) return false;
    p++;
    while (*p && isspace((unsigned char)*p)) p++;
    if (*p != '"') return false;
    p++;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < out_size) out[i++] = *p++;
    out[i] = '\0';
    return i > 0;
}

static bool get_latest_version(char *out, size_t out_size) {
    if (!fetch_latest_json()) return false;
    char *json = read_whole_file_plain(temp_json_read_path());
    if (!json) return false;
    bool ok = extract_json_string(json, "tag_name", out, out_size);
    free(json);
    return ok;
}

static int command_update_check(void) {
    char latest[128];
    printf("Pomidor: проверка обновлений...\n");
    if (!get_latest_version(latest, sizeof(latest))) {
        fprintf(stderr, "Не удалось получить последнюю версию. Проверь интернет и наличие релизов на GitHub.\n");
        return 1;
    }
    printf("Текущая версия: %s\n", POMIDOR_VERSION);
    printf("Последняя версия: %s\n", latest);
    int cmp = compare_versions(POMIDOR_VERSION, latest);
    if (cmp < 0) printf("Доступно обновление. Запусти: pomidor update\n");
    else printf("Установлена актуальная версия.\n");
    return 0;
}

static int command_update(void) {
    printf("Pomidor: запуск обновления через GitHub Releases...\n");
#ifdef _WIN32
    const char *cmd = "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$u='https://github.com/MihailKashintsev/pomidor-c/releases/latest/download/install.ps1'; $p=Join-Path $env:TEMP 'pomidor-install.ps1'; Invoke-WebRequest -UseBasicParsing $u -OutFile $p; & $p\"";
#else
    const char *cmd = "curl -fsSL https://github.com/MihailKashintsev/pomidor-c/releases/latest/download/install.sh | sh";
#endif
    int code = run_command_plain(cmd);
    if (code != 0) {
        fprintf(stderr, "Обновление не выполнено. Убедись, что в последнем GitHub Release есть install.ps1/install.sh и архив с бинарником.\n");
        return 1;
    }
    return 0;
}

static void print_help(void) {
    printf("Pomidor %s\n", POMIDOR_VERSION);
    printf("Usage:\n");
    printf("  pomidor file.pom          Запустить файл Pomidor\n");
    printf("  pomidor --mem file.pom    Запустить файл и показать проверку памяти\n");
    printf("  pomidor --version         Показать версию\n");
    printf("  pomidor update-check      Проверить обновления\n");
    printf("  pomidor update            Обновить Pomidor через GitHub Releases\n");
}

static void *pm_malloc(size_t size) {
    void *ptr = malloc(size ? size : 1);
    if (!ptr) { fprintf(stderr, "Pomidor: out of memory\n"); exit(1); }
    g_allocs++;
    return ptr;
}

static void *pm_realloc(void *old, size_t size) {
    if (!old) g_allocs++;
    void *ptr = realloc(old, size ? size : 1);
    if (!ptr) { fprintf(stderr, "Pomidor: out of memory\n"); exit(1); }
    return ptr;
}

static void pm_free(void *ptr) {
    if (ptr) { g_frees++; free(ptr); }
}

static char *pm_strdup_len(const char *s, size_t len) {
    char *out = (char *)pm_malloc(len + 1);
    memcpy(out, s, len);
    out[len] = '\0';
    return out;
}

static char *pm_strdup(const char *s) { return pm_strdup_len(s, strlen(s)); }

static bool is_ident_start(unsigned char c) {
    return c == '_' || c >= 128 || isalpha(c);
}

static bool is_ident_part(unsigned char c) {
    return c == '_' || c >= 128 || isalnum(c);
}

typedef enum {
    TOK_EOF, TOK_NEWLINE,
    TOK_NUMBER, TOK_STRING, TOK_IDENT,
    TOK_LET, TOK_PRINT, TOK_IF, TOK_ELSE, TOK_WHILE,
    TOK_TRUE, TOK_FALSE,
    TOK_LPAREN, TOK_RPAREN, TOK_LBRACE, TOK_RBRACE,
    TOK_COMMA,
    TOK_PLUS, TOK_MINUS, TOK_STAR, TOK_SLASH, TOK_PERCENT,
    TOK_ASSIGN, TOK_EQ, TOK_NEQ, TOK_GT, TOK_GTE, TOK_LT, TOK_LTE,
    TOK_AND, TOK_OR, TOK_NOT
} TokenType;

typedef struct {
    TokenType type;
    char *text;
    double number;
    int line;
    int col;
} Token;

typedef struct {
    Token *items;
    int count;
    int capacity;
} TokenList;

static void tokens_push(TokenList *list, Token t) {
    if (list->count >= list->capacity) {
        list->capacity = list->capacity ? list->capacity * 2 : 128;
        list->items = (Token *)pm_realloc(list->items, sizeof(Token) * (size_t)list->capacity);
    }
    list->items[list->count++] = t;
}

static bool streq(const char *a, const char *b) { return strcmp(a, b) == 0; }

static TokenType keyword_type(const char *s) {
    if (streq(s, "let") || streq(s, "пусть")) return TOK_LET;
    if (streq(s, "print") || streq(s, "выведи")) return TOK_PRINT;
    if (streq(s, "if") || streq(s, "если")) return TOK_IF;
    if (streq(s, "else") || streq(s, "иначе")) return TOK_ELSE;
    if (streq(s, "while") || streq(s, "пока")) return TOK_WHILE;
    if (streq(s, "true") || streq(s, "истина")) return TOK_TRUE;
    if (streq(s, "false") || streq(s, "ложь")) return TOK_FALSE;
    if (streq(s, "and") || streq(s, "и")) return TOK_AND;
    if (streq(s, "or") || streq(s, "или")) return TOK_OR;
    if (streq(s, "not") || streq(s, "не")) return TOK_NOT;
    return TOK_IDENT;
}

static TokenList lex_source(const char *src) {
    TokenList list = {0};
    int i = 0, line = 1, col = 1;
    while (src[i]) {
        char c = src[i];
        if (c == ' ' || c == '\t' || c == '\r') { i++; col++; continue; }
        if (c == '\n' || c == ';') {
            tokens_push(&list, (Token){TOK_NEWLINE, NULL, 0, line, col});
            i++; line++; col = 1; continue;
        }
        if (c == '#') {
            while (src[i] && src[i] != '\n') { i++; col++; }
            continue;
        }
        if (isdigit((unsigned char)c)) {
            int start = i, start_col = col;
            while (isdigit((unsigned char)src[i])) { i++; col++; }
            if (src[i] == '.') {
                i++; col++;
                while (isdigit((unsigned char)src[i])) { i++; col++; }
            }
            char *text = pm_strdup_len(src + start, (size_t)(i - start));
            tokens_push(&list, (Token){TOK_NUMBER, text, strtod(text, NULL), line, start_col});
            continue;
        }
        if (c == '"') {
            int start_col = col;
            i++; col++;
            char *buf = NULL;
            int len = 0, cap = 0;
            while (src[i] && src[i] != '"') {
                char ch = src[i++]; col++;
                if (ch == '\\') {
                    char e = src[i++]; col++;
                    if (e == 'n') ch = '\n';
                    else if (e == 't') ch = '\t';
                    else if (e == '"') ch = '"';
                    else if (e == '\\') ch = '\\';
                    else ch = e;
                }
                if (len + 1 >= cap) { cap = cap ? cap * 2 : 32; buf = (char *)pm_realloc(buf, (size_t)cap); }
                buf[len++] = ch;
            }
            if (src[i] != '"') { fprintf(stderr, "Line %d:%d: string is not closed\n", line, start_col); exit(1); }
            i++; col++;
            if (!buf) { buf = (char *)pm_malloc(1); }
            buf[len] = '\0';
            tokens_push(&list, (Token){TOK_STRING, buf, 0, line, start_col});
            continue;
        }
        if (is_ident_start((unsigned char)c)) {
            int start = i, start_col = col;
            while (is_ident_part((unsigned char)src[i])) { i++; col++; }
            char *text = pm_strdup_len(src + start, (size_t)(i - start));
            tokens_push(&list, (Token){keyword_type(text), text, 0, line, start_col});
            continue;
        }
        int start_col = col;
        if (c == '(') { tokens_push(&list, (Token){TOK_LPAREN, NULL, 0, line, col}); i++; col++; continue; }
        if (c == ')') { tokens_push(&list, (Token){TOK_RPAREN, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '{') { tokens_push(&list, (Token){TOK_LBRACE, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '}') { tokens_push(&list, (Token){TOK_RBRACE, NULL, 0, line, col}); i++; col++; continue; }
        if (c == ',') { tokens_push(&list, (Token){TOK_COMMA, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '+') { tokens_push(&list, (Token){TOK_PLUS, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '-') { tokens_push(&list, (Token){TOK_MINUS, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '*') { tokens_push(&list, (Token){TOK_STAR, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '/') { tokens_push(&list, (Token){TOK_SLASH, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '%') { tokens_push(&list, (Token){TOK_PERCENT, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '=' && src[i+1] == '=') { tokens_push(&list, (Token){TOK_EQ, NULL, 0, line, col}); i += 2; col += 2; continue; }
        if (c == '!' && src[i+1] == '=') { tokens_push(&list, (Token){TOK_NEQ, NULL, 0, line, col}); i += 2; col += 2; continue; }
        if (c == '>' && src[i+1] == '=') { tokens_push(&list, (Token){TOK_GTE, NULL, 0, line, col}); i += 2; col += 2; continue; }
        if (c == '<' && src[i+1] == '=') { tokens_push(&list, (Token){TOK_LTE, NULL, 0, line, col}); i += 2; col += 2; continue; }
        if (c == '=') { tokens_push(&list, (Token){TOK_ASSIGN, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '>') { tokens_push(&list, (Token){TOK_GT, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '<') { tokens_push(&list, (Token){TOK_LT, NULL, 0, line, col}); i++; col++; continue; }
        if (c == '!') { tokens_push(&list, (Token){TOK_NOT, NULL, 0, line, col}); i++; col++; continue; }
        fprintf(stderr, "Line %d:%d: unknown character '%c'\n", line, start_col, c);
        exit(1);
    }
    tokens_push(&list, (Token){TOK_EOF, NULL, 0, line, col});
    return list;
}

static void tokens_free(TokenList *list) {
    for (int i = 0; i < list->count; i++) pm_free(list->items[i].text);
    pm_free(list->items);
}

typedef enum { VAL_NIL, VAL_NUMBER, VAL_STRING, VAL_BOOL } ValueType;

typedef struct {
    ValueType type;
    double number;
    char *string;
    bool boolean;
} Value;

static Value val_nil(void) { return (Value){VAL_NIL, 0, NULL, false}; }
static Value val_num(double n) { return (Value){VAL_NUMBER, n, NULL, false}; }
static Value val_bool(bool b) { return (Value){VAL_BOOL, 0, NULL, b}; }
static Value val_str_own(char *s) { return (Value){VAL_STRING, 0, s, false}; }
static Value val_str(const char *s) { return val_str_own(pm_strdup(s)); }
static Value val_copy(Value v) {
    if (v.type == VAL_STRING) return val_str(v.string ? v.string : "");
    return v;
}
static void val_free(Value v) { if (v.type == VAL_STRING) pm_free(v.string); }
static bool val_truthy(Value v) {
    if (v.type == VAL_BOOL) return v.boolean;
    if (v.type == VAL_NUMBER) return v.number != 0;
    if (v.type == VAL_STRING) return v.string && v.string[0] != 0;
    return false;
}
static char *val_to_string(Value v) {
    char buf[128];
    if (v.type == VAL_STRING) return pm_strdup(v.string ? v.string : "");
    if (v.type == VAL_BOOL) return pm_strdup(v.boolean ? "истина" : "ложь");
    if (v.type == VAL_NIL) return pm_strdup("ничего");
    snprintf(buf, sizeof(buf), "%g", v.number);
    return pm_strdup(buf);
}
static void val_print(Value v) {
    if (v.type == VAL_STRING) printf("%s", v.string ? v.string : "");
    else if (v.type == VAL_BOOL) printf("%s", v.boolean ? "истина" : "ложь");
    else if (v.type == VAL_NIL) printf("ничего");
    else printf("%g", v.number);
}

typedef struct { char *name; Value value; } Var;
typedef struct { Var *items; int count; int capacity; } Env;

static int env_find(Env *env, const char *name) {
    for (int i = 0; i < env->count; i++) if (streq(env->items[i].name, name)) return i;
    return -1;
}
static void env_set(Env *env, const char *name, Value value) {
    int idx = env_find(env, name);
    if (idx >= 0) {
        val_free(env->items[idx].value);
        env->items[idx].value = val_copy(value);
        return;
    }
    if (env->count >= env->capacity) {
        env->capacity = env->capacity ? env->capacity * 2 : 32;
        env->items = (Var *)pm_realloc(env->items, sizeof(Var) * (size_t)env->capacity);
    }
    env->items[env->count].name = pm_strdup(name);
    env->items[env->count].value = val_copy(value);
    env->count++;
}
static Value env_get(Env *env, const char *name, Token t) {
    int idx = env_find(env, name);
    if (idx < 0) {
        fprintf(stderr, "Line %d:%d: variable '%s' not found\n", t.line, t.col, name);
        exit(1);
    }
    return val_copy(env->items[idx].value);
}
static void env_free(Env *env) {
    for (int i = 0; i < env->count; i++) { pm_free(env->items[i].name); val_free(env->items[i].value); }
    pm_free(env->items);
}

typedef struct {
    Token *tokens;
    int pos;
    int end;
    Env *env;
} Parser;

static Token peek(Parser *p) { return p->tokens[p->pos]; }
static Token prev(Parser *p) { return p->tokens[p->pos - 1]; }
static bool at_end(Parser *p) { return p->pos >= p->end || peek(p).type == TOK_EOF; }
static bool check(Parser *p, TokenType t) { return !at_end(p) && peek(p).type == t; }
static bool match(Parser *p, TokenType t) { if (check(p, t)) { p->pos++; return true; } return false; }
static void skip_newlines(Parser *p) { while (check(p, TOK_NEWLINE)) p->pos++; }
static void error_at(Token t, const char *msg) { fprintf(stderr, "Line %d:%d: %s\n", t.line, t.col, msg); exit(1); }
static Token consume(Parser *p, TokenType t, const char *msg) { if (check(p, t)) return p->tokens[p->pos++]; error_at(peek(p), msg); return peek(p); }

static Value parse_expr(Parser *p);
static void execute_range(Token *tokens, int start, int end, Env *env);

static int find_next_lbrace(Parser *p) {
    for (int i = p->pos; i < p->end; i++) if (p->tokens[i].type == TOK_LBRACE) return i;
    error_at(peek(p), "expected '{'");
    return -1;
}
static int find_matching_rbrace(Token *tokens, int lbrace, int end) {
    int depth = 0;
    for (int i = lbrace; i < end; i++) {
        if (tokens[i].type == TOK_LBRACE) depth++;
        else if (tokens[i].type == TOK_RBRACE) {
            depth--;
            if (depth == 0) return i;
        }
    }
    error_at(tokens[lbrace], "block is not closed with '}'");
    return -1;
}

static double as_number(Value v, Token op) {
    if (v.type != VAL_NUMBER) error_at(op, "number expected");
    return v.number;
}
static bool values_equal(Value a, Value b) {
    if (a.type != b.type) return false;
    if (a.type == VAL_NUMBER) return a.number == b.number;
    if (a.type == VAL_BOOL) return a.boolean == b.boolean;
    if (a.type == VAL_STRING) return strcmp(a.string ? a.string : "", b.string ? b.string : "") == 0;
    return true;
}
static Value op_add(Value a, Value b) {
    if (a.type == VAL_STRING || b.type == VAL_STRING) {
        char *sa = val_to_string(a), *sb = val_to_string(b);
        size_t la = strlen(sa), lb = strlen(sb);
        char *out = (char *)pm_malloc(la + lb + 1);
        memcpy(out, sa, la); memcpy(out + la, sb, lb + 1);
        pm_free(sa); pm_free(sb);
        return val_str_own(out);
    }
    return val_num(as_number(a, (Token){0}) + as_number(b, (Token){0}));
}

static Value parse_primary(Parser *p) {
    if (match(p, TOK_NUMBER)) return val_num(prev(p).number);
    if (match(p, TOK_STRING)) return val_str(prev(p).text);
    if (match(p, TOK_TRUE)) return val_bool(true);
    if (match(p, TOK_FALSE)) return val_bool(false);
    if (match(p, TOK_IDENT)) {
        Token name = prev(p);
        if (match(p, TOK_LPAREN)) {
            Value arg = val_nil();
            bool has_arg = false;
            if (!check(p, TOK_RPAREN)) { arg = parse_expr(p); has_arg = true; }
            consume(p, TOK_RPAREN, "expected ')' after function call");
            Value result = val_nil();
            if (streq(name.text, "len") || streq(name.text, "длина")) {
                if (!has_arg) error_at(name, "len/длина needs one argument");
                char *s = val_to_string(arg);
                result = val_num((double)strlen(s));
                pm_free(s);
            } else if (streq(name.text, "str") || streq(name.text, "строка")) {
                if (!has_arg) error_at(name, "str/строка needs one argument");
                result = val_str_own(val_to_string(arg));
            } else if (streq(name.text, "num") || streq(name.text, "число")) {
                if (!has_arg) error_at(name, "num/число needs one argument");
                char *s = val_to_string(arg);
                result = val_num(strtod(s, NULL));
                pm_free(s);
            } else {
                error_at(name, "unknown builtin function");
            }
            val_free(arg);
            return result;
        }
        return env_get(p->env, name.text, name);
    }
    if (match(p, TOK_LPAREN)) {
        Value v = parse_expr(p);
        consume(p, TOK_RPAREN, "expected ')' after expression");
        return v;
    }
    error_at(peek(p), "expression expected");
    return val_nil();
}

static Value parse_unary(Parser *p) {
    if (match(p, TOK_MINUS)) {
        Token op = prev(p);
        Value right = parse_unary(p);
        double n = -as_number(right, op);
        val_free(right);
        return val_num(n);
    }
    if (match(p, TOK_NOT)) {
        Value right = parse_unary(p);
        bool b = !val_truthy(right);
        val_free(right);
        return val_bool(b);
    }
    return parse_primary(p);
}

static Value parse_factor(Parser *p) {
    Value left = parse_unary(p);
    while (match(p, TOK_STAR) || match(p, TOK_SLASH) || match(p, TOK_PERCENT)) {
        Token op = prev(p);
        Value right = parse_unary(p);
        double a = as_number(left, op), b = as_number(right, op);
        val_free(left); val_free(right);
        if (op.type == TOK_STAR) left = val_num(a * b);
        else if (op.type == TOK_SLASH) left = val_num(a / b);
        else left = val_num((double)((long long)a % (long long)b));
    }
    return left;
}

static Value parse_term(Parser *p) {
    Value left = parse_factor(p);
    while (match(p, TOK_PLUS) || match(p, TOK_MINUS)) {
        Token op = prev(p);
        Value right = parse_factor(p);
        if (op.type == TOK_PLUS) {
            Value res = op_add(left, right);
            val_free(left); val_free(right);
            left = res;
        } else {
            double n = as_number(left, op) - as_number(right, op);
            val_free(left); val_free(right);
            left = val_num(n);
        }
    }
    return left;
}

static Value parse_compare(Parser *p) {
    Value left = parse_term(p);
    while (match(p, TOK_GT) || match(p, TOK_GTE) || match(p, TOK_LT) || match(p, TOK_LTE)) {
        Token op = prev(p);
        Value right = parse_term(p);
        double a = as_number(left, op), b = as_number(right, op);
        val_free(left); val_free(right);
        if (op.type == TOK_GT) left = val_bool(a > b);
        else if (op.type == TOK_GTE) left = val_bool(a >= b);
        else if (op.type == TOK_LT) left = val_bool(a < b);
        else left = val_bool(a <= b);
    }
    return left;
}

static Value parse_equality(Parser *p) {
    Value left = parse_compare(p);
    while (match(p, TOK_EQ) || match(p, TOK_NEQ)) {
        Token op = prev(p);
        Value right = parse_compare(p);
        bool eq = values_equal(left, right);
        val_free(left); val_free(right);
        left = val_bool(op.type == TOK_EQ ? eq : !eq);
    }
    return left;
}

static Value parse_and(Parser *p) {
    Value left = parse_equality(p);
    while (match(p, TOK_AND)) {
        Value right = parse_equality(p);
        bool b = val_truthy(left) && val_truthy(right);
        val_free(left); val_free(right);
        left = val_bool(b);
    }
    return left;
}

static Value parse_expr(Parser *p) {
    Value left = parse_and(p);
    while (match(p, TOK_OR)) {
        Value right = parse_and(p);
        bool b = val_truthy(left) || val_truthy(right);
        val_free(left); val_free(right);
        left = val_bool(b);
    }
    return left;
}

static Value eval_expression_range(Token *tokens, int start, int end, Env *env) {
    Parser p = {tokens, start, end, env};
    skip_newlines(&p);
    Value v = parse_expr(&p);
    return v;
}

static void skip_to_line_end(Parser *p) {
    while (!at_end(p) && !check(p, TOK_NEWLINE) && !check(p, TOK_RBRACE)) p->pos++;
    while (check(p, TOK_NEWLINE)) p->pos++;
}

static void parse_statement(Parser *p) {
    skip_newlines(p);
    if (at_end(p) || check(p, TOK_RBRACE)) return;

    if (match(p, TOK_LET)) {
        Token name = consume(p, TOK_IDENT, "expected variable name after let/пусть");
        consume(p, TOK_ASSIGN, "expected '=' after variable name");
        Value v = parse_expr(p);
        env_set(p->env, name.text, v);
        val_free(v);
        skip_to_line_end(p);
        return;
    }

    if (check(p, TOK_IDENT) && p->pos + 1 < p->end && p->tokens[p->pos + 1].type == TOK_ASSIGN) {
        Token name = p->tokens[p->pos++];
        p->pos++;
        Value v = parse_expr(p);
        env_set(p->env, name.text, v);
        val_free(v);
        skip_to_line_end(p);
        return;
    }

    if (match(p, TOK_PRINT)) {
        Value v = parse_expr(p);
        val_print(v);
        printf("\n");
        val_free(v);
        skip_to_line_end(p);
        return;
    }

    if (match(p, TOK_IF)) {
        int cond_start = p->pos;
        int lb = find_next_lbrace(p);
        int rb = find_matching_rbrace(p->tokens, lb, p->end);
        Value cond = eval_expression_range(p->tokens, cond_start, lb, p->env);
        bool ok = val_truthy(cond);
        val_free(cond);
        int after = rb + 1;
        while (after < p->end && p->tokens[after].type == TOK_NEWLINE) after++;
        int else_lb = -1, else_rb = -1;
        if (after < p->end && p->tokens[after].type == TOK_ELSE) {
            Parser tmp = *p; tmp.pos = after + 1;
            else_lb = find_next_lbrace(&tmp);
            else_rb = find_matching_rbrace(p->tokens, else_lb, p->end);
        }
        if (ok) execute_range(p->tokens, lb + 1, rb, p->env);
        else if (else_lb >= 0) execute_range(p->tokens, else_lb + 1, else_rb, p->env);
        p->pos = else_rb >= 0 ? else_rb + 1 : rb + 1;
        skip_newlines(p);
        return;
    }

    if (match(p, TOK_WHILE)) {
        int cond_start = p->pos;
        int lb = find_next_lbrace(p);
        int rb = find_matching_rbrace(p->tokens, lb, p->end);
        int guard = 0;
        for (;;) {
            Value cond = eval_expression_range(p->tokens, cond_start, lb, p->env);
            bool ok = val_truthy(cond);
            val_free(cond);
            if (!ok) break;
            execute_range(p->tokens, lb + 1, rb, p->env);
            if (++guard > 1000000) error_at(p->tokens[lb], "loop stopped: too many iterations");
        }
        p->pos = rb + 1;
        skip_newlines(p);
        return;
    }

    error_at(peek(p), "unknown statement");
}

static void execute_range(Token *tokens, int start, int end, Env *env) {
    Parser p = {tokens, start, end, env};
    while (!at_end(&p)) parse_statement(&p);
}

static char *read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { fprintf(stderr, "Cannot open file: %s\n", path); exit(1); }
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = (char *)pm_malloc((size_t)size + 1);
    if (size > 0) fread(buf, 1, (size_t)size, f);
    buf[size] = '\0';
    fclose(f);
    return buf;
}

int main(int argc, char **argv) {
    bool show_mem = false;
    const char *file = NULL;

    if (argc <= 1) {
        print_help();
        return 0;
    }

    for (int i = 1; i < argc; i++) {
        if (streq(argv[i], "--mem")) show_mem = true;
        else if (streq(argv[i], "--help") || streq(argv[i], "-h")) { print_help(); return 0; }
        else if (streq(argv[i], "--version") || streq(argv[i], "version")) { printf("Pomidor %s\n", POMIDOR_VERSION); return 0; }
        else if (streq(argv[i], "update-check")) return command_update_check();
        else if (streq(argv[i], "update")) return command_update();
        else file = argv[i];
    }
    if (!file) {
        print_help();
        return 0;
    }
    char *source = read_file(file);
    TokenList tokens = lex_source(source);
    Env env = {0};
    execute_range(tokens.items, 0, tokens.count, &env);
    env_free(&env);
    tokens_free(&tokens);
    pm_free(source);
    if (show_mem) {
        printf("\n[memory] allocations: %zu, frees: %zu, alive: %zu\n", g_allocs, g_frees, g_allocs - g_frees);
    }
    return 0;
}

