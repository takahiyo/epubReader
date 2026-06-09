// プラットフォーム判定テストスクリプト

const PLATFORM_TYPES = {
    QUEST3: 'quest3',
    ANDROID: 'android',
    WINDOWS: 'windows',
    IPAD: 'ipad',
    IOS: 'ios',
    UNKNOWN: 'unknown',
};

function detectPlatformMock(ua, maxTouchPoints = 0) {
    const isQuest3 = () => /Quest|OculusBrowser/i.test(ua);
    const isAndroid = () => /Android/i.test(ua) && !isQuest3();
    const isIPad = () => /iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
    const isIPhone = () => /iPhone|iPod/i.test(ua);
    const isWindows = () => /Windows|Win32|Win64/i.test(ua);

    if (isQuest3()) return PLATFORM_TYPES.QUEST3;
    if (isAndroid()) return PLATFORM_TYPES.ANDROID;
    if (isIPad()) return PLATFORM_TYPES.IPAD;
    if (isIPhone()) return PLATFORM_TYPES.IOS;
    if (isWindows()) return PLATFORM_TYPES.WINDOWS;
    return PLATFORM_TYPES.UNKNOWN;
}

const testCases = [
    {
        name: "Windows 11 Vivaldi (ユーザー報告のUA)",
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        maxTouchPoints: 0,
        expected: PLATFORM_TYPES.WINDOWS
    },
    {
        name: "Quest 3 Oculus Browser",
        ua: "Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/32.0.0.0.0 Chrome/118.0.5993.155 Mobile Safari/537.36",
        maxTouchPoints: 5,
        expected: PLATFORM_TYPES.QUEST3
    },
    {
        name: "Android Chrome",
        ua: "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
        maxTouchPoints: 5,
        expected: PLATFORM_TYPES.ANDROID
    },
    {
        name: "iPad Safari (iPadOS 16)",
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
        maxTouchPoints: 5,
        expected: PLATFORM_TYPES.IPAD
    },
    {
        name: "iPhone Safari",
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/605.1.15",
        maxTouchPoints: 5,
        expected: PLATFORM_TYPES.IOS
    },
    {
        name: "macOS Desktop Safari",
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
        maxTouchPoints: 0,
        expected: PLATFORM_TYPES.UNKNOWN
    }
];

let success = true;
testCases.forEach(tc => {
    const result = detectPlatformMock(tc.ua, tc.maxTouchPoints);
    const passed = result === tc.expected;
    console.log(`[${passed ? "PASS" : "FAIL"}] ${tc.name}`);
    console.log(`   Expected: ${tc.expected}, Got: ${result}`);
    if (!passed) success = false;
});

if (success) {
    console.log("すべてのテストケースに合格しました！");
} else {
    console.error("いくつかのテストケースで失敗しました。");
    process.exit(1);
}
