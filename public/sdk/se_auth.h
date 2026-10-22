#pragma once
#include <string>

struct SeAuthResult {
    bool ok = false;
    std::string application;
    std::string variant;
    std::string expires;
    std::string message;
};

// host: panel host, without https://
// expected_application: the Name from Applications
SeAuthResult se_authorize(
    const std::wstring& host,
    const std::string& key,
    const std::string& hwid,
    const std::string& expected_application);
