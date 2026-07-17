package com.allerac.robot

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun RobotFaceHost(
    state: RobotState,
    modifier: Modifier = Modifier,
) {
    RobotFace(state = state, modifier = modifier)
}
