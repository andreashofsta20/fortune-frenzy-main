module.exports = {
	parser: "@typescript-eslint/parser",
	parserOptions: {
		jsx: true,
		useJSXTextNode: true,
		ecmaVersion: 2021,
		sourceType: "module",
		project: "./tsconfig.json",
		tsconfigRootDir: __dirname,
	},
	ignorePatterns: ["/out"],
	plugins: ["@typescript-eslint", "roblox-ts", "prettier"],
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:roblox-ts/recommended",
		"plugin:prettier/recommended",
	],
	rules: {
		"prettier/prettier": "warn",
		"roblox-ts/lua-truthiness": "off",
	},
};
