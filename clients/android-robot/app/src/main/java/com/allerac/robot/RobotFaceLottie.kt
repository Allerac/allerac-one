package com.allerac.robot

private data class FaceSpec(
    val eyeScale: Float,
    val pupilScale: Float,
    val mouthOpen: Float,
    val browTilt: Float,
    val accent: String,
    val caption: String,
    val blink: Boolean,
    val scan: Boolean,
)

fun robotFaceLottieJson(state: RobotState): String {
    val spec = when (state) {
        RobotState.Idle -> FaceSpec(1.0f, 1.0f, 0.18f, 0f, color(0.06f, 0.86f, 1.0f), "IDLE", true, true)
        RobotState.Listening -> FaceSpec(1.22f, 0.78f, 0.10f, -5f, color(0.18f, 0.95f, 1.0f), "LISTEN", false, true)
        RobotState.Thinking -> FaceSpec(0.82f, 0.9f, 0.08f, 7f, color(0.92f, 0.70f, 1.0f), "THINK", true, true)
        RobotState.Speaking -> FaceSpec(1.04f, 0.92f, 0.78f, 0f, color(1.0f, 0.76f, 0.96f), "TALK", false, true)
        RobotState.Paused -> FaceSpec(0.72f, 0.95f, 0.04f, 0f, color(0.50f, 0.60f, 0.68f), "PAUSE", false, false)
        RobotState.Error -> FaceSpec(0.78f, 0.7f, 0.16f, 12f, color(1.0f, 0.24f, 0.30f), "ERROR", false, true)
    }

    val eyeW = 155f * spec.eyeScale
    val eyeH = 118f * spec.eyeScale
    val pupil = 48f * spec.pupilScale
    val mouthH = 18f + (82f * spec.mouthOpen)
    val mouthLayer = if (state == RobotState.Speaking) {
        animatedMouthLayer(mouthH, spec.accent)
    } else {
        mouthLayer(mouthH, spec.accent)
    }
    val blinkLayer = if (spec.blink) blinkMaskLayer() else ""
    val scanLayer = if (spec.scan) scanLineLayer(spec.accent) else ""

    return """
{
  "v":"5.7.4","fr":30,"ip":0,"op":90,"w":720,"h":480,"nm":"AlleracRobotFace","ddd":0,"assets":[],
  "layers":[
    ${textLayer(spec.caption, spec.accent)},
    $scanLayer
    $blinkLayer
    $mouthLayer,
    ${browLayer(235f, 132f, -spec.browTilt, spec.accent)},
    ${browLayer(485f, 132f, spec.browTilt, spec.accent)},
    ${pupilLayer(235f, 214f, pupil)},
    ${pupilLayer(485f, 214f, pupil)},
    ${eyeLayer(235f, 214f, eyeW, eyeH, spec.accent)},
    ${eyeLayer(485f, 214f, eyeW, eyeH, spec.accent)},
    ${visorHighlightLayer()},
    ${visorLayer()},
    ${shadowLayer()}
  ]
}
""".trimIndent()
}

private fun shadowLayer(): String = shapeLayer(
    name = "shadow",
    shapes = """
      ${ellipse(360f, 252f, 654f, 394f)},
      ${fill(color(0f, 0f, 0f), 48)}
    """.trimIndent(),
)

private fun visorLayer(): String = shapeLayer(
    name = "visor",
    shapes = """
      ${roundRect(360f, 238f, 622f, 356f, 48f)},
      ${fill(color(0.005f, 0.008f, 0.012f), 100)},
      ${stroke(color(0.12f, 0.18f, 0.22f), 42, 5)}
    """.trimIndent(),
)

private fun visorHighlightLayer(): String = shapeLayer(
    name = "visor-highlight",
    opacity = 54,
    shapes = """
      ${path(false, listOf(112f to 112f, 258f to 80f, 608f to 92f))},
      ${stroke(color(0.75f, 0.92f, 1.0f), 38, 7)}
    """.trimIndent(),
)

private fun eyeLayer(x: Float, y: Float, w: Float, h: Float, accent: String): String = shapeLayer(
    name = "eye",
    shapes = """
      ${ellipse(x, y, w, h)},
      ${fill(accent, 100)},
      ${stroke(color(0.70f, 0.95f, 1.0f), 88, 5)}
    """.trimIndent(),
)

private fun pupilLayer(x: Float, y: Float, size: Float): String = shapeLayer(
    name = "pupil",
    shapes = """
      ${ellipse(x, y, size, size)},
      ${fill(color(0.005f, 0.01f, 0.015f), 100)}
    """.trimIndent(),
)

private fun browLayer(x: Float, y: Float, rotation: Float, accent: String): String = shapeLayer(
    name = "brow",
    rotation = rotation,
    shapes = """
      ${roundRect(x, y, 138f, 18f, 9f)},
      ${fill(accent, 86)}
    """.trimIndent(),
)

private fun mouthLayer(height: Float, accent: String): String = shapeLayer(
    name = "mouth",
    shapes = """
      ${path(false, listOf(248f to 332f, 308f to (350f + height * 0.28f), 414f to (350f + height * 0.28f), 474f to 332f))},
      ${stroke(accent, 92, 13)}
    """.trimIndent(),
)

private fun animatedMouthLayer(height: Float, accent: String): String = shapeLayer(
    name = "mouth-speaking",
    shapes = """
      ${path(true, listOf(252f to 320f, 318f to (320f + height), 402f to (320f + height), 468f to 320f))},
      ${stroke(accent, 96, 15)}
    """.trimIndent(),
    scale = """{"a":1,"k":[{"t":0,"s":[100,72,100]},{"t":10,"s":[100,118,100]},{"t":20,"s":[100,82,100]},{"t":30,"s":[100,132,100]},{"t":42,"s":[100,78,100]},{"t":60,"s":[100,116,100]},{"t":90,"s":[100,72,100]}]}""",
)

private fun blinkMaskLayer(): String = shapeLayer(
    name = "blink",
    opacity = 35,
    shapes = """
      ${roundRect(360f, 214f, 450f, 10f, 5f)},
      ${fill(color(0.85f, 0.95f, 1.0f), 100)}
    """.trimIndent(),
    scale = """{"a":1,"k":[{"t":0,"s":[100,0,100]},{"t":36,"s":[100,0,100]},{"t":40,"s":[100,420,100]},{"t":45,"s":[100,0,100]},{"t":90,"s":[100,0,100]}]}""",
) + ","

private fun scanLineLayer(accent: String): String = shapeLayer(
    name = "scan-line",
    opacity = 32,
    shapes = """
      ${roundRect(360f, 145f, 520f, 5f, 2.5f)},
      ${fill(accent, 100)}
    """.trimIndent(),
    position = """{"a":1,"k":[{"t":0,"s":[0,-42,0]},{"t":45,"s":[0,154,0]},{"t":90,"s":[0,-42,0]}]}""",
) + ","

private fun textLayer(text: String, accent: String): String = """
{
  "ddd":0,"ind":20,"ty":5,"nm":"state-label","sr":1,
  "ks":{"o":{"a":0,"k":42},"r":{"a":0,"k":0},"p":{"a":0,"k":[360,424,0]},"a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]}},
  "ao":0,
  "t":{"d":{"k":[{"s":{"s":22,"f":"Roboto Mono","t":"$text","j":2,"tr":180,"lh":26,"ls":0,"fc":$accent},"t":0}]},"p":{},"m":{"g":1,"a":{"a":0,"k":[0,0]}}},
  "ip":0,"op":90,"st":0,"bm":0
}
""".trimIndent()

private fun shapeLayer(
    name: String,
    shapes: String,
    opacity: Int = 100,
    rotation: Float = 0f,
    scale: String = """{"a":0,"k":[100,100,100]}""",
    position: String = """{"a":0,"k":[0,0,0]}""",
): String = """
{
  "ddd":0,"ind":1,"ty":4,"nm":"$name","sr":1,
  "ks":{"o":{"a":0,"k":$opacity},"r":{"a":0,"k":$rotation},"p":$position,"a":{"a":0,"k":[0,0,0]},"s":$scale},
  "ao":0,
  "shapes":[
    $shapes
  ],
  "ip":0,"op":90,"st":0,"bm":0
}
""".trimIndent()

private fun ellipse(x: Float, y: Float, w: Float, h: Float): String =
    """{"ty":"el","p":{"a":0,"k":[${n(x)},${n(y)}]},"s":{"a":0,"k":[${n(w)},${n(h)}]},"d":1,"nm":"ellipse"}"""

private fun roundRect(x: Float, y: Float, w: Float, h: Float, radius: Float): String =
    """{"ty":"rc","d":1,"s":{"a":0,"k":[${n(w)},${n(h)}]},"p":{"a":0,"k":[${n(x)},${n(y)}]},"r":{"a":0,"k":${n(radius)}},"nm":"rect"}"""

private fun path(closed: Boolean, points: List<Pair<Float, Float>>): String {
    val vertices = points.joinToString(",") { "[${n(it.first)},${n(it.second)}]" }
    val tangents = points.joinToString(",") { "[0,0]" }
    return """{"ty":"sh","ks":{"a":0,"k":{"i":[$tangents],"o":[$tangents],"v":[$vertices],"c":$closed}},"nm":"path"}"""
}

private fun fill(color: String, opacity: Int): String =
    """{"ty":"fl","c":{"a":0,"k":$color},"o":{"a":0,"k":$opacity},"r":1,"bm":0,"nm":"fill"}"""

private fun stroke(color: String, opacity: Int, width: Int): String =
    """{"ty":"st","c":{"a":0,"k":$color},"o":{"a":0,"k":$opacity},"w":{"a":0,"k":$width},"lc":2,"lj":2,"bm":0,"nm":"stroke"}"""

private fun color(r: Float, g: Float, b: Float, a: Float = 1f): String =
    "[${n(r)},${n(g)},${n(b)},${n(a)}]"

private fun n(value: Float): String = "%.3f".format(java.util.Locale.US, value).trimEnd('0').trimEnd('.')
