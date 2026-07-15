package com.allerac.robot

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke

@Composable
fun RobotFace(
    state: RobotState,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "robot-face")
    val blink by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 2200
                1f at 0
                1f at 1780
                0.12f at 1840
                1f at 1910
                1f at 2200
            },
        ),
        label = "blink",
    )
    val mouthPulse by transition.animateFloat(
        initialValue = 0.45f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 340
                0.45f at 0
                1.0f at 170
                0.45f at 340
            },
        ),
        label = "mouth",
    )
    val thinkShift by transition.animateFloat(
        initialValue = -0.03f,
        targetValue = 0.03f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 1240
                -0.03f at 0
                0.03f at 620
                -0.03f at 1240
            },
        ),
        label = "thinking",
    )

    val ledColor = when (state) {
        RobotState.Error -> Color(0xFFFF5C5C)
        RobotState.Listening -> Color(0xFF7CE7FF)
        RobotState.Thinking -> Color(0xFFFFD36A)
        RobotState.Speaking -> Color(0xFF48D7FF)
        RobotState.Paused -> Color(0xFF777777)
        RobotState.Idle -> Color(0xFF70D9FF)
    }
    val accentColor = if (state == RobotState.Error) Color(0xFFFF8B8B) else Color(0xFFFFB8F2)

    Canvas(modifier = modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        val visorWidth = w * 0.86f
        val visorHeight = h * 0.80f
        val visorLeft = (w - visorWidth) / 2f
        val visorTop = h * 0.08f
        val dot = (w * 0.0118f).coerceIn(6f, 12f)
        val gap = dot * 0.46f
        val pitch = dot + gap

        fun drawLedDot(x: Float, y: Float, color: Color, alpha: Float = 1f) {
            drawRoundRect(
                color = color.copy(alpha = alpha * 0.22f),
                topLeft = Offset(x - dot * 0.86f, y - dot * 0.86f),
                size = Size(dot * 1.72f, dot * 1.72f),
                cornerRadius = CornerRadius(dot * 0.45f, dot * 0.45f),
            )
            drawRoundRect(
                color = color.copy(alpha = alpha),
                topLeft = Offset(x - dot / 2f, y - dot / 2f),
                size = Size(dot, dot),
                cornerRadius = CornerRadius(dot * 0.22f, dot * 0.22f),
            )
        }

        fun drawPixelEllipse(
            center: Offset,
            width: Float,
            height: Float,
            color: Color,
            pupilShift: Float,
            blinkScale: Float,
        ) {
            val halfW = width / 2f
            val halfH = height * blinkScale / 2f
            var x = center.x - halfW
            while (x <= center.x + halfW) {
                var y = center.y - height / 2f
                while (y <= center.y + height / 2f) {
                    val nx = (x - center.x) / halfW
                    val ny = (y - center.y) / halfH.coerceAtLeast(dot)
                    if (nx * nx + ny * ny <= 1f) {
                        val pupilX = center.x + width * pupilShift
                        val pupilY = center.y + height * 0.02f
                        val px = (x - pupilX) / (width * 0.20f)
                        val py = (y - pupilY) / (height * 0.33f)
                        val inPupil = px * px + py * py <= 1f
                        drawLedDot(
                            x = x,
                            y = y,
                            color = if (inPupil) Color.Black else color,
                            alpha = if (inPupil) 0.92f else 0.95f,
                        )
                    }
                    y += pitch
                }
                x += pitch
            }
        }

        fun drawPixelBrow(center: Offset, mirror: Float) {
            val count = 13
            val width = pitch * (count - 1)
            val arch = h * 0.030f
            for (i in 0 until count) {
                val t = i / (count - 1).toFloat()
                val x = center.x + mirror * (-width / 2f + width * t)
                val y = center.y - arch * kotlin.math.sin(t * 3.14159f)
                drawLedDot(
                    x = x,
                    y = y,
                    color = accentColor,
                    alpha = 0.92f,
                )
            }
        }

        fun drawPixelSmile(center: Offset, width: Float, height: Float, color: Color) {
            val count = 22
            for (i in 0..count) {
                val t = i / count.toFloat()
                val x = center.x - width / 2f + width * t
                val y = center.y + height * (0.18f - 4f * (t - 0.5f) * (t - 0.5f))
                drawLedDot(x, y, color, 0.94f)
            }
        }

        fun drawSleepEye(center: Offset, width: Float, color: Color) {
            val count = 13
            for (i in 0..count) {
                val t = i / count.toFloat()
                val x = center.x - width / 2f + width * t
                val y = center.y + dot * 0.5f * kotlin.math.sin(t * 3.14f)
                drawLedDot(x, y, color, 0.62f)
            }
        }

        fun drawSpeakingMouth(center: Offset, width: Float, height: Float, color: Color) {
            val columns = 17
            val open = mouthPulse
            val halfOpen = height * (0.18f + open * 0.82f)
            for (i in 0 until columns) {
                val t = i / (columns - 1).toFloat()
                val x = center.x - width / 2f + width * t
                val edge = kotlin.math.abs(t - 0.5f) * 2f
                val columnOpen = halfOpen * (1f - edge * edge * 0.55f)
                val topY = center.y - columnOpen / 2f
                val bottomY = center.y + columnOpen / 2f
                drawLedDot(x, topY, color, 0.92f)
                drawLedDot(x, bottomY, color, 0.92f)
                if (open > 0.72f && edge < 0.55f) {
                    drawLedDot(x, center.y, color, 0.55f)
                }
            }
        }

        val centerY = visorTop + visorHeight * 0.42f
        val eyeWidth = visorWidth * 0.28f
        val baseEyeHeight = visorHeight * 0.25f
        val eyeHeight = when (state) {
            RobotState.Listening -> baseEyeHeight * 1.22f
            RobotState.Thinking -> baseEyeHeight * 0.78f
            RobotState.Error -> baseEyeHeight
            RobotState.Paused -> baseEyeHeight * 0.35f
            else -> baseEyeHeight
        }
        val eyeOffset = if (state == RobotState.Thinking) visorWidth * thinkShift else 0f
        val pupilShift = when (state) {
            RobotState.Thinking -> thinkShift * 0.8f
            else -> 0f
        }
        val blinkScale = when (state) {
            RobotState.Paused -> 0.32f
            RobotState.Listening -> 1f
            else -> blink.coerceAtLeast(0.58f)
        }
        val leftEye = Offset(visorLeft + visorWidth * 0.34f + eyeOffset, centerY)
        val rightEye = Offset(visorLeft + visorWidth * 0.66f + eyeOffset, centerY)
        val strokeWidth = w * 0.012f

        if (state == RobotState.Paused) {
            drawSleepEye(leftEye, eyeWidth * 0.72f, ledColor)
            drawSleepEye(rightEye, eyeWidth * 0.72f, ledColor)
        } else if (state == RobotState.Error) {
            listOf(leftEye, rightEye).forEach { eye ->
                drawLine(
                    color = ledColor,
                    start = Offset(eye.x - eyeWidth * 0.32f, eye.y - eyeHeight * 0.42f),
                    end = Offset(eye.x + eyeWidth * 0.32f, eye.y + eyeHeight * 0.42f),
                    strokeWidth = strokeWidth,
                    cap = StrokeCap.Round,
                )
                drawLine(
                    color = ledColor,
                    start = Offset(eye.x + eyeWidth * 0.32f, eye.y - eyeHeight * 0.42f),
                    end = Offset(eye.x - eyeWidth * 0.32f, eye.y + eyeHeight * 0.42f),
                    strokeWidth = strokeWidth,
                    cap = StrokeCap.Round,
                )
            }
        } else {
            drawPixelBrow(Offset(leftEye.x, leftEye.y - eyeHeight * 0.75f), mirror = 1f)
            drawPixelBrow(Offset(rightEye.x, rightEye.y - eyeHeight * 0.75f), mirror = -1f)
            drawPixelEllipse(leftEye, eyeWidth, eyeHeight, ledColor, pupilShift, blinkScale)
            drawPixelEllipse(rightEye, eyeWidth, eyeHeight, ledColor, pupilShift, blinkScale)
        }

        when (state) {
            RobotState.Speaking -> {
                drawSpeakingMouth(
                    center = Offset(visorLeft + visorWidth * 0.50f, visorTop + visorHeight * 0.76f),
                    width = visorWidth * 0.22f,
                    height = visorHeight * 0.16f,
                    color = accentColor,
                )
            }
            RobotState.Error -> {
                drawArc(
                    color = ledColor,
                    startAngle = 205f,
                    sweepAngle = 130f,
                    useCenter = false,
                    topLeft = Offset(w * 0.43f, h * 0.66f),
                    size = Size(w * 0.14f, h * 0.10f),
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
                )
            }
            RobotState.Thinking -> {
                drawPixelSmile(
                    center = Offset(visorLeft + visorWidth * 0.50f, visorTop + visorHeight * 0.76f),
                    width = visorWidth * 0.18f,
                    height = visorHeight * 0.012f,
                    color = accentColor.copy(alpha = 0.72f),
                )
            }
            else -> {
                val smileHeight = when (state) {
                    RobotState.Listening -> visorHeight * 0.012f
                    RobotState.Paused -> visorHeight * 0.006f
                    else -> visorHeight * 0.055f
                }
                drawPixelSmile(
                    center = Offset(visorLeft + visorWidth * 0.50f, visorTop + visorHeight * 0.76f),
                    width = if (state == RobotState.Paused) visorWidth * 0.14f else visorWidth * 0.28f,
                    height = smileHeight,
                    color = accentColor,
                )
            }
        }
    }
}
