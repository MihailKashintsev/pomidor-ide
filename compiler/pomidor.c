#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define MAX_LINE 1024

static char* trim(char* s) {
    while (isspace((unsigned char)*s)) s++;
    if (*s == 0) return s;
    char* end = s + strlen(s) - 1;
    while (end > s && isspace((unsigned char)*end)) end--;
    end[1] = '\0';
    return s;
}

static int starts_with(const char* s, const char* prefix) {
    return strncmp(s, prefix, strlen(prefix)) == 0;
}

static void print_string_argument(const char* line, int line_number) {
    const char* first = strchr(line, '"');
    const char* last = strrchr(line, '"');
    if (!first || !last || first == last) {
        fprintf(stderr, "Pomidor error: line %d: expected string in quotes.\n", line_number);
        exit(1);
    }
    for (const char* p = first + 1; p < last; p++) putchar(*p);
    putchar('\n');
}

int main(int argc, char** argv) {
    if (argc < 2) {
        fprintf(stderr, "Pomidor error: expected .pom file path.\n");
        return 1;
    }

    FILE* file = fopen(argv[1], "r");
    if (!file) {
        fprintf(stderr, "Pomidor error: cannot open file: %s\n", argv[1]);
        return 1;
    }

    char line[MAX_LINE];
    int line_number = 0;

    while (fgets(line, sizeof(line), file)) {
        line_number++;
        char* code = trim(line);

        if (code[0] == '\0' || starts_with(code, "//")) continue;
        if (strcmp(code, "}") == 0 || strcmp(code, "{") == 0) continue;
        if (starts_with(code, "иначе") || starts_with(code, "else")) continue;

        if (starts_with(code, "скажи ")) {
            print_string_argument(code, line_number);
            continue;
        }

        if (starts_with(code, "print ")) {
            print_string_argument(code, line_number);
            continue;
        }

        if (starts_with(code, "число ") || starts_with(code, "number ") || starts_with(code, "строка ") || starts_with(code, "string ")) {
            continue;
        }

        if (starts_with(code, "если ") || starts_with(code, "if ") || starts_with(code, "пока ") || starts_with(code, "while ")) {
            if (!strchr(code, '{')) {
                fprintf(stderr, "Pomidor error: line %d: expected '{' after condition.\n", line_number);
                fclose(file);
                return 1;
            }
            continue;
        }

        if (starts_with(code, "скажы")) {
            fprintf(stderr, "Pomidor error: line %d: unknown command 'скажы'. Did you mean 'скажи'?\n", line_number);
            fclose(file);
            return 1;
        }

        fprintf(stderr, "Pomidor error: line %d: unknown command: %s\n", line_number, code);
        fclose(file);
        return 1;
    }

    fclose(file);
    return 0;
}
