const regex = /(?<!\d)5{3,}\+*(?!\d)(?!\s*([=\*xX×tTต\-/]|\d|\+\s*\d))/g;

const testCases = [
    { input: "ขำๆ 555", expected: "ขำๆ " },
    { input: "55555", expected: "" },
    { input: "55555+", expected: "" },
    { input: "55555++", expected: "" },
    { input: "555=100", expected: "555=100" },
    { input: "555 = 100", expected: "555 = 100" },
    { input: "555 100", expected: "555 100" },
    { input: "555 100*100", expected: "555 100*100" },
    { input: "12555", expected: "12555" },
    { input: "55554", expected: "55554" },
    { input: "ขำมากเลย 55555555++ นะ", expected: "ขำมากเลย  นะ" },
    { input: "555+10", expected: "555+10" }
];

testCases.forEach((tc, idx) => {
    const output = tc.input.replace(regex, '');
    const passed = output === tc.expected;
    console.log(`Test ${idx + 1}: "${tc.input}" -> "${output}" | Expected: "${tc.expected}" | ${passed ? "PASSED" : "FAILED"}`);
});
