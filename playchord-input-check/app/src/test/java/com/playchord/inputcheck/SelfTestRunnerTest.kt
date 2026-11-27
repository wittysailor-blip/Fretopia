package com.playchord.inputcheck

import org.junit.Assert.assertTrue
import org.junit.Test

class SelfTestRunnerTest {
    @Test
    fun everySyntheticCasePasses() {
        val results = SelfTestRunner().runAll()
        val failed = results.filterNot { it.passed }
        assertTrue(
            failed.joinToString("\n") { "${it.name}: expected ${it.expected}; actual ${it.actual}" },
            failed.isEmpty() && results.size == 9,
        )
    }

    @Test
    fun peakDbfsUsesTwentyLog10AndAFloor() {
        assertTrue(DiagnosticConsumer.peakDbfs(1f) == 0.0)
        assertTrue(Math.abs(DiagnosticConsumer.peakDbfs(0.5f) - (-6.0206)) < 1e-3)
        assertTrue(DiagnosticConsumer.peakDbfs(0f) == DiagnosticConsumer.FLOOR_DBFS)
    }
}
