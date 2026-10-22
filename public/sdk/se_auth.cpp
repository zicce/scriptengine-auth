#include "se_auth.h"
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#pragma comment(lib, "winhttp.lib")

static std::string value_of(const std::string& body, const char* key) {
    const std::string prefix = std::string(key) + "=";
    size_t at = 0;
    while (at < body.size()) {
        size_t end = body.find('\n', at);
        if (end == std::string::npos) end = body.size();
        std::string line = body.substr(at, end - at);
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (line.compare(0, prefix.size(), prefix) == 0)
            return line.substr(prefix.size());
        at = end + 1;
    }
    return {};
}

SeAuthResult se_authorize(const std::wstring& host, const std::string& key, const std::string& hwid, const std::string& expected_application) {
    SeAuthResult result;
    const std::string form = "key=" + key + "&hwid=" + hwid;
    const wchar_t* headers = L"Content-Type: application/x-www-form-urlencoded\r\n";

    HINTERNET session = WinHttpOpen(L"ScriptEngine/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    HINTERNET connect = session ? WinHttpConnect(session, host.c_str(), INTERNET_DEFAULT_HTTPS_PORT, 0) : nullptr;
    HINTERNET request = connect ? WinHttpOpenRequest(connect, L"POST", L"/api/loader/license", nullptr, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE) : nullptr;
    BOOL sent = request && WinHttpSendRequest(request, headers, (DWORD)-1, (LPVOID)form.data(), (DWORD)form.size(), (DWORD)form.size(), 0);
    BOOL received = sent && WinHttpReceiveResponse(request, nullptr);

    std::string body;
    if (received) {
        for (;;) {
            DWORD available = 0;
            if (!WinHttpQueryDataAvailable(request, &available) || !available) break;
            std::string chunk(available, '\0');
            DWORD read = 0;
            if (!WinHttpReadData(request, chunk.data(), available, &read)) break;
            chunk.resize(read);
            body += chunk;
        }
    }
    if (request) WinHttpCloseHandle(request);
    if (connect) WinHttpCloseHandle(connect);
    if (session) WinHttpCloseHandle(session);

    if (!received) {
        result.message = "Could not reach the server.";
        return result;
    }
    if (value_of(body, "status") != "ok") {
        result.message = value_of(body, "message");
        if (result.message.empty()) result.message = "License rejected.";
        return result;
    }
    result.application = value_of(body, "application");
    result.variant = value_of(body, "variant");
    result.expires = value_of(body, "expires");
    if (result.application != expected_application) {
        result.message = "This key belongs to another application.";
        return result;
    }
    result.ok = true;
    return result;
}
