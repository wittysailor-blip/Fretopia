cmake_minimum_required(VERSION 3.16)
project(fretopia_layer1 VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(L1_BUILD_TESTS "Build tests" ON)
option(L1_BUILD_TOOLS "Build l1probe" ON)
set(L1_SANITIZE "" CACHE STRING "Sanitizer: '', address, thread, undefined")

set(L1_SOURCES
    src/platform.cpp
    src/capture_sink.cpp
    src/assembler.cpp
    src/backend_sim.cpp
    src/backend_wasapi.cpp
    src/engine.cpp)

if(MSVC)
    add_compile_options(/W4 /permissive- /utf-8 /D_USE_MATH_DEFINES /DNOMINMAX /D_CRT_SECURE_NO_WARNINGS)
else()
    add_compile_options(-Wall -Wextra -Wno-unused-parameter)
endif()
if(L1_SANITIZE)
    add_compile_options(-fsanitize=${L1_SANITIZE} -fno-omit-frame-pointer -g)
    add_link_options(-fsanitize=${L1_SANITIZE})
endif()

function(l1_link_platform tgt)
    if(WIN32)
        target_link_libraries(${tgt} PRIVATE ole32 avrt synchronization uuid)
        if(MINGW)
            target_link_options(${tgt} PRIVATE -static)   # no MinGW runtime DLLs (libstdc++, winpthread)
        endif()
    else()
        find_package(Threads REQUIRED)
        target_link_libraries(${tgt} PRIVATE Threads::Threads)
    endif()
endfunction()

# Shared library for Unity / other hosts: fretopia_l1.dll / libfretopia_l1.so
add_library(fretopia_l1 SHARED ${L1_SOURCES})
target_include_directories(fretopia_l1 PUBLIC include PRIVATE src)
target_compile_definitions(fretopia_l1 PRIVATE L1_BUILDING_DLL)
set_target_properties(fretopia_l1 PROPERTIES CXX_VISIBILITY_PRESET hidden PREFIX "")
if(NOT WIN32)
    set_target_properties(fretopia_l1 PROPERTIES PREFIX "lib")
endif()
l1_link_platform(fretopia_l1)

# Static library for tests and tools (internal headers reachable).
add_library(fretopia_l1_static STATIC ${L1_SOURCES})
target_include_directories(fretopia_l1_static PUBLIC include src)
target_compile_definitions(fretopia_l1_static PUBLIC L1_STATIC)
l1_link_platform(fretopia_l1_static)

if(L1_BUILD_TOOLS)
    add_executable(l1probe tools/l1probe.cpp)
    target_link_libraries(l1probe PRIVATE fretopia_l1_static)
    l1_link_platform(l1probe)
endif()

if(L1_BUILD_TESTS)
    enable_testing()
    foreach(t test_spsc test_pipeline test_engine test_conditioning)
        add_executable(${t} tests/${t}.cpp tests/alloc_audit.cpp)
        target_link_libraries(${t} PRIVATE fretopia_l1_static)
        l1_link_platform(${t})
        add_test(NAME ${t} COMMAND ${t} WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/tests)
    endforeach()
    set_tests_properties(test_engine PROPERTIES TIMEOUT 1800)
endif()
