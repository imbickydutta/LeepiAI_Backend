const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/env');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.apiKey = config.apis.gemini;
    this.genAI = null;
    this.model = null;

    if (this.apiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        logger.info('🤖 AIService initialized with Gemini API');
      } catch (error) {
        logger.error('❌ Failed to initialize Gemini AI:', error);
      }
    } else {
      logger.warn('⚠️ No Gemini API key found. AI features will be disabled.');
    }
  }

  /**
   * Check if AI service is available
   * @returns {boolean} Service availability
   */
  isAvailable() {
    return this.model !== null;
  }

  /**
   * Generate summary of interview transcript
   * @param {string} transcript - The full transcript text
   * @returns {Promise<Object>} Generated summary result
   */
  async generateSummary(transcript) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'AI service not available - missing API key'
      };
    }

    try {
      const prompt = this._createSummaryPrompt(transcript);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const summary = response.text();

      logger.info('📝 Summary generated successfully', {
        inputLength: transcript.length,
        outputLength: summary.length
      });

      return {
        success: true,
        summary
      };
    } catch (error) {
      logger.error('❌ Failed to generate summary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate comprehensive interview debrief
   * @param {string} transcript - The full transcript text
   * @returns {Promise<Object>} Structured debrief analysis
   */
  async generateInterviewDebrief(transcript) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'AI service not available - missing API key'
      };
    }

    try {
      const prompt = this._createDebriefPrompt(transcript);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const debriefContent = response.text();

      const debrief = {
        content: debriefContent,
        format: 'markdown',
        generatedAt: new Date()
      };

      logger.info('📊 Interview debrief generated successfully', {
        inputLength: transcript.length,
        outputLength: debriefContent.length
      });

      return {
        success: true,
        debrief
      };
    } catch (error) {
      logger.error('❌ Failed to generate debrief:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Chat with transcript context
   * @param {string} transcript - The full transcript
   * @param {string} message - User's question/message
   * @param {Array} chatHistory - Previous chat messages
   * @returns {Promise<Object>} AI response
   */
  async chatWithTranscript(transcript, message, chatHistory = []) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'AI service not available - missing API key'
      };
    }

    try {
      const prompt = this._createChatPrompt(transcript, message, chatHistory);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const aiResponse = response.text();

      logger.info('💬 Chat response generated', {
        messageLength: message.length,
        responseLength: aiResponse.length,
        historyLength: chatHistory.length
      });

      return {
        success: true,
        response: aiResponse
      };
    } catch (error) {
      logger.error('❌ Failed to generate chat response:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract questions and answers from transcript
   * @param {string} transcript - The full transcript
   * @returns {Promise<Object>} Structured Q&A pairs
   */
  async extractQuestionsAndAnswers(transcript) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'AI service not available - missing API key'
      };
    }

    try {
      const prompt = this._createQAExtractionPrompt(transcript);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();

      // Try to parse JSON response
      let qaList = [];
      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          qaList = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        logger.warn('Failed to parse Q&A JSON, returning empty array');
      }

      logger.info('❓ Questions and answers extracted', {
        qaCount: qaList.length
      });

      return {
        success: true,
        questionsAndAnswers: qaList
      };
    } catch (error) {
      logger.error('❌ Failed to extract Q&A:', error);
      return {
        success: false,
        error: error.message,
        questionsAndAnswers: []
      };
    }
  }

  /**
   * Generate follow-up questions based on transcript
   * @param {string} transcript - The full transcript
   * @returns {Promise<Object>} Array of follow-up questions
   */
  async generateFollowUpQuestions(transcript) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'AI service not available - missing API key',
        questions: this._getDefaultFollowUpQuestions()
      };
    }

    try {
      const prompt = this._createFollowUpQuestionsPrompt(transcript);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();

      let questions = [];
      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          questions = JSON.parse(jsonMatch[0]);
        } else {
          questions = this._getDefaultFollowUpQuestions();
        }
      } catch (parseError) {
        questions = this._getDefaultFollowUpQuestions();
      }

      logger.info('❓ Follow-up questions generated', {
        questionCount: questions.length
      });

      return {
        success: true,
        questions
      };
    } catch (error) {
      logger.warn('Failed to generate follow-up questions:', error.message);
      return {
        success: false,
        error: error.message,
        questions: this._getDefaultFollowUpQuestions()
      };
    }
  }

  /**
   * Test AI service connection
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'No API key configured'
      };
    }

    try {
      const result = await this.model.generateContent('Say "Hello" if you can hear me.');
      const response = await result.response;
      const text = response.text();

      return {
        success: true,
        message: 'AI service is working correctly',
        response: text
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // =====================================================
  // PROMPT CREATION METHODS
  // =====================================================

  /**
   * Create prompt for summary generation
   * @param {string} transcript - Transcript content
   * @returns {string} Summary prompt
   */
  _createSummaryPrompt(transcript) {
    const lines = transcript.split('\n').filter(line => line.trim());
    const micLines = lines.filter(line => line.includes('MIC [') || line.includes('input'));
    const sysLines = lines.filter(line => line.includes('SYS [') || line.includes('output'));
    const totalDuration = this._estimateDuration(lines);

    return `
You are analyzing a **job interview transcript** recorded with LeepiAI Interview Recorder. This transcript captures both the interviewer and candidate sides of the conversation.

**CONTEXT:**
- This is a professional job interview recording
- MIC/input = Candidate responses
- SYS/output = Interviewer questions/comments
- Estimated duration: ${totalDuration} minutes
- Total candidate segments: ${micLines.length}
- Total interviewer segments: ${sysLines.length}

**TRANSCRIPT:**
${transcript}

**INSTRUCTIONS:**
Generate a comprehensive interview summary in **markdown format** with the following structure:

# Interview Summary

## 📋 Overview
- **Duration**: ${totalDuration} minutes
- **Format**: Interview conversation
- **Participants**: Interviewer and Candidate

## 🎯 Key Topics Discussed
[List the main subjects/areas covered - technical skills, experience, etc.]

## 💬 Interview Flow
[Describe how the conversation progressed, major sections]

## 🔍 Candidate Performance Highlights
[Key strengths and responses demonstrated by the candidate]

## 📊 Question Categories
[Types of questions asked - behavioral, technical, situational, etc.]

## 🎭 Communication Style
[Assessment of communication effectiveness, clarity, confidence]

## ⏱️ Pacing and Structure
[Comments on interview timing, flow, and organization]

## 📝 Notable Moments
[Any standout responses, discussions, or interactions]

---
*Generated by LeepiAI Interview Recorder*

**Guidelines:**
- Use proper markdown formatting with headers, lists, and emphasis
- Keep content professional and objective
- Focus on interview-specific insights
- Length: 300-500 words
- Highlight both interviewer and candidate contributions
`;
  }

  /**
   * Create prompt for interview debrief generation
   * @param {string} transcript - Transcript content
   * @returns {string} Debrief prompt
   */
  _createDebriefPrompt(transcript) {
    const lines = transcript.split('\n').filter(line => line.trim());
    const questions = this._extractQuestions(lines);
    const totalDuration = this._estimateDuration(lines);

    return `
You are a professional interview analyst reviewing a **job interview transcript** recorded with LeepiAI Interview Recorder.

**CONTEXT:**
- Professional job interview recording
- MIC/input = Candidate responses
- SYS/output = Interviewer questions/comments
- Duration: ${totalDuration} minutes
- Interview segments: ${lines.length}
- Identified questions: ${questions.length}

**TRANSCRIPT:**
${transcript}

**TASK:**
Generate a comprehensive interview debrief in **markdown format** following this structure:

# Interview Debrief Report

## 📊 Interview Overview
- **Interview Duration**: ${totalDuration} minutes
- **Round Type**: [Determine: Technical, HR, Behavioral, Final, etc.]
- **Date**: [Current date]

## ❓ Questions Asked & Topics Covered

### Technical Questions
[List technical questions with topics in parentheses]

### Behavioral Questions  
[List behavioral/situational questions with topics]

### Experience & Background
[Questions about work history, projects, education]

### Other Questions
[Any additional questions that don't fit above categories]

## 🎯 Candidate Performance Analysis

### Overall Score: [X]/100

### ✅ Strengths Demonstrated
- [Specific strength with example from transcript]
- [Another strength with evidence]
- [Communication effectiveness]

### 🔧 Areas for Improvement
- [Specific area with constructive feedback]
- [Another improvement area with suggestions]
- [Technical or soft skills to develop]

### 💬 Communication Style Assessment
[Evaluation of clarity, confidence, engagement, listening skills]

### 📋 Technical Competency
[Assessment of technical knowledge demonstrated, if applicable]

## 🔍 Key Insights & Observations
- [Important insight about candidate's fit]
- [Notable responses or reactions]
- [Interview flow and engagement level]

## 📝 Detailed Question-Answer Analysis

[For each major question, provide:
- Question asked
- Candidate's response summary  
- Quality of response (Good/Average/Needs Work)
- Specific feedback]

## 🚀 Recommendations

### For the Candidate:
- [Specific improvement suggestions]
- [Skills to develop before next interview]
- [Communication tips]

### For the Interviewer/Company:
- [Assessment of candidate fit]
- [Recommended next steps]
- [Additional areas to explore]

## 📊 Interview Quality Metrics
- **Preparation Level**: [Assessment]
- **Technical Depth**: [If applicable]
- **Cultural Fit Indicators**: [Observations]
- **Overall Impression**: [Summary]

---
*Report generated by LeepiAI Interview Recorder*

**ANALYSIS GUIDELINES:**
- Provide specific examples from the conversation
- Be constructive and professional in feedback
- Score based on: preparation, communication, technical skills (if applicable), problem-solving
- Focus on actionable insights for improvement
- Maintain objectivity while being helpful

Generate the complete markdown report above. Use professional language and specific examples from the transcript.
`;
  }

  /**
   * Create prompt for chat interaction
   * @param {string} transcript - Transcript content
   * @param {string} message - User message
   * @param {Array} chatHistory - Previous messages
   * @returns {string} Chat prompt
   */
  _createChatPrompt(transcript, message, chatHistory) {
    let prompt = `
You are an AI assistant helping to analyze and discuss an interview transcript. 
You have access to the full transcript and can answer questions about it, provide insights, and help with analysis.

TRANSCRIPT:
${transcript}

`;

    // Add chat history if available
    if (chatHistory && chatHistory.length > 0) {
      prompt += '\nPREVIOUS CONVERSATION:\n';
      chatHistory.slice(-6).forEach(msg => {
        prompt += `${msg.role}: ${msg.content}\n`;
      });
    }

    prompt += `
USER QUESTION: ${message}

Please provide a helpful, accurate response based on the transcript content. 
- Use markdown formatting to structure your response clearly
- Use **bold** for emphasis and key points
- Use bullet points (- or *) for lists
- Use ## for section headers when organizing multiple topics
- Use \`code\` for technical terms or specific phrases
- Reference specific parts of the transcript when relevant
- Be conversational but informative
- If the question is about something not in the transcript, clearly state that
- Provide actionable insights when possible

Format your response using markdown for better readability.
`;

    return prompt;
  }

  /**
   * Create prompt for Q&A extraction
   * @param {string} transcript - Transcript content
   * @returns {string} Q&A extraction prompt
   */
  _createQAExtractionPrompt(transcript) {
    return `
Analyze this interview transcript and extract all question-answer pairs.

TRANSCRIPT:
${transcript}

Return a JSON array of objects in this format:
[
  {
    "question": "The interviewer's question",
    "answer": "The interviewee's response",
    "timestamp": "approximate time or position",
    "category": "type of question (behavioral, technical, situational, etc.)"
  }
]

Guidelines:
- Include only clear question-answer pairs
- Categorize questions appropriately
- Provide meaningful answer summaries
- Return only valid JSON
`;
  }

  /**
   * Create prompt for follow-up questions
   * @param {string} transcript - Transcript content
   * @returns {string} Follow-up questions prompt
   */
  _createFollowUpQuestionsPrompt(transcript) {
    return `
Based on this interview transcript, generate 5-7 thoughtful follow-up questions that could deepen the conversation.

TRANSCRIPT:
${transcript}

Generate questions that:
- Probe deeper into topics mentioned
- Explore practical applications
- Ask for specific examples
- Challenge assumptions constructively
- Encourage reflection

Return as a JSON array of strings:
["Question 1", "Question 2", ...]
`;
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  /**
   * Estimate duration from transcript lines
   * @param {Array} lines - Transcript lines
   * @returns {number} Duration in minutes
   */
  _estimateDuration(lines) {
    const timePattern = /\[(\d+(?:\.\d+)?)s\]/;
    let maxTime = 0;

    for (const line of lines) {
      const match = line.match(timePattern);
      if (match) {
        const time = parseFloat(match[1]);
        if (time > maxTime) {
          maxTime = time;
        }
      }
    }

    return Math.ceil(maxTime / 60) || 5; // Convert to minutes, default to 5
  }

  /**
   * Extract questions from transcript lines
   * @param {Array} lines - Transcript lines
   * @returns {Array} Extracted questions
   */
  _extractQuestions(lines) {
    const questions = [];

    for (const line of lines) {
      if ((line.includes('SYS [') || line.includes('output')) && line.includes('?')) {
        const textMatch = line.match(/(?:SYS \[\d+(?:\.\d+)?s\]:|output): (.+)/);
        if (textMatch) {
          questions.push(textMatch[1]);
        }
      }
    }

    return questions;
  }

  /**
   * Get default follow-up questions
   * @returns {Array} Default questions
   */
  _getDefaultFollowUpQuestions() {
    return [
      "What would you do differently in this situation?",
      "Can you provide more details about your approach?",
      "How would you handle similar challenges in the future?",
      "What specific examples can you share from your experience?",
      "How do you stay updated with industry trends?",
      "What questions do you have for the interviewer?"
    ];
  }
}

module.exports = new AIService(); 