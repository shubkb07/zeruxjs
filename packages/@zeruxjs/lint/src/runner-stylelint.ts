import stylelint from "stylelint";

export async function runStylelint({ fix = false }) {
    const result = await stylelint.lint({
        files: ["**/*.{css,scss}"],
        fix
    });

    if (result.report) {
        console.log(result.report);
    }
}