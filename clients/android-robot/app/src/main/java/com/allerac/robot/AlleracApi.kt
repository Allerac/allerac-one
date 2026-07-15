package com.allerac.robot

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class AlleracApi(
    private val baseUrl: String,
    private val apiKey: String,
    private val provider: String,
    private val model: String,
) {
    suspend fun createConversation(): String = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("title", "Allerac Robot")
            .put("domainSlug", "chat")

        val json = request("POST", "/api/v1/conversations", body)
        json.getJSONObject("data").getJSONObject("conversation").getString("id")
    }

    suspend fun sendMessage(conversationId: String, message: String): AssistantReply =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("message", message)
                .put("provider", provider)
                .put("model", model)

            val json = request("POST", "/api/v1/conversations/$conversationId/messages", body)
            val data = json.getJSONObject("data")
            val assistantMessage = data.getJSONObject("message")
            val events = data.optJSONArray("events") ?: JSONArray()

            AssistantReply(
                content = assistantMessage.getString("content"),
                eventCount = events.length(),
            )
        }

    private fun request(method: String, path: String, body: JSONObject): JSONObject {
        val normalizedBase = baseUrl.trimEnd('/')
        val connection = (URL("$normalizedBase$path").openConnection() as HttpURLConnection)
        connection.requestMethod = method
        connection.connectTimeout = 15000
        connection.readTimeout = 120000
        connection.setRequestProperty("Authorization", "Bearer $apiKey")
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Accept", "application/json")
        connection.doOutput = true

        OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
            writer.write(body.toString())
        }

        val responseCode = connection.responseCode
        val stream = if (responseCode in 200..299) {
            connection.inputStream
        } else {
            connection.errorStream ?: connection.inputStream
        }
        val text = BufferedReader(stream.reader(Charsets.UTF_8)).use { it.readText() }

        if (responseCode !in 200..299) {
            throw IllegalStateException("HTTP $responseCode: $text")
        }

        return JSONObject(text)
    }
}

data class AssistantReply(
    val content: String,
    val eventCount: Int,
)
