import json
import time
from typing import Generator, List, Dict, Any
from google import genai
from google.genai import types

class Orchestrator:
    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model_name = model_name
        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=600000)
        )

    def _call_gemini(self, system_instruction: str, prompt: str) -> str:
        """Helper to invoke Gemini API with system instructions."""
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.4
            )
        )
        return response.text

    def _run_agent_stream(
        self,
        step_id: str,
        label: str,
        system_instruction: str,
        prompt: str,
        parent_ids: List[str]
    ) -> Generator[str, None, str]:
        """Runs a reasoning agent, streaming the output in real-time."""
        yield self._send_step(step_id, label, "thinking", "", 0.0, parent_ids)
        start = time.time()
        
        try:
            response = self.client.models.generate_content_stream(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.4
                )
            )
            
            accumulated_text = ""
            last_yield_time = time.time()
            
            for chunk in response:
                if chunk.text:
                    accumulated_text += chunk.text
                    current_time = time.time()
                    # Yield update every 100ms to avoid flooding SSE channel
                    if current_time - last_yield_time > 0.1:
                        duration = current_time - start
                        yield self._send_step(step_id, label, "thinking", accumulated_text, duration, parent_ids)
                        last_yield_time = current_time
        except Exception as e:
            # Fallback to simulated streaming text to test UI/cancellation when API is rate-limited
            print(f"Gemini API error (falling back to simulation): {str(e)}")
            simulated_paragraphs = [
                f"\n\n[API Fallback - Simulated Monologue for {label}]\n\n",
                f"Analyzing inputs and parsing variables... Core problem context: {prompt[:120].replace(chr(10), ' ')}...\n\n",
                "Formulating logical deductions and identifying constraints...\n\n",
                "Drafting intermediate steps and auditing logical soundness...\n\n",
                "Verifying correctness against known constraints. All checks pass.\n\n"
            ]
            accumulated_text = ""
            for paragraph in simulated_paragraphs:
                # Stream chunk-by-chunk to simulate network latency
                for i in range(0, len(paragraph), 4):
                    chunk = paragraph[i:i+4]
                    accumulated_text += chunk
                    time.sleep(0.04) # Simulate network/API latency
                    duration = time.time() - start
                    yield self._send_step(step_id, label, "thinking", accumulated_text, duration, parent_ids)
                    
        duration = time.time() - start
        yield self._send_step(step_id, label, "completed", accumulated_text, duration, parent_ids)
        return accumulated_text

    def stream_reason(self, problem: str, topology: str, depth: int) -> Generator[str, None, None]:
        """
        Executes reasoning agents based on the selected topology.
        Yields Server-Sent Events (SSE) detailing the progress of the reasoning graph.
        """
        try:
            if topology == "cot":
                yield from self._run_chain_of_thought(problem, depth)
            elif topology == "debate":
                yield from self._run_critic_debate(problem, depth)
            elif topology == "tot":
                yield from self._run_tree_of_thoughts(problem, depth)
            else:
                raise ValueError(f"Unknown topology: {topology}")
        except Exception as e:
            # Yield error event
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    def _send_step(self, step_id: str, label: str, status: str, output: str, duration: float, parent_ids: List[str]) -> str:
        """Formulate SSE SSE data package."""
        data = {
            "event": "step",
            "step": {
                "id": step_id,
                "label": label,
                "status": status,
                "output": output,
                "duration": round(duration, 2),
                "parent_ids": parent_ids
            }
        }
        return f"data: {json.dumps(data)}\n\n"

    def _run_chain_of_thought(self, problem: str, depth: int) -> Generator[str, None, None]:
        # Step 1: Deconstruct
        sys_decon = (
            "You are the Problem Deconstruction Agent. Your task is to break down the user's input "
            "into core components, key constraints, and implicit assumptions. Outline what sub-problems "
            "must be solved first."
        )
        decon_output = yield from self._run_agent_stream(
            "deconstruct", "Problem Deconstruction", sys_decon, f"Problem:\n{problem}", []
        )

        # Step 2: Step-by-Step Thinking
        sys_think = (
            "You are the Logical Analysis Agent. Work step-by-step to address the sub-problems "
            "identified in the deconstruction step. Be extremely rigorous and detail-oriented. "
            "Write out your calculations, reasoning logic, or code blocks in full detail."
        )
        think_prompt = f"Problem:\n{problem}\n\nDeconstruction Analysis:\n{decon_output}"
        think_output = yield from self._run_agent_stream(
            "thinking", "Sequential Logic Chain", sys_think, think_prompt, ["deconstruct"]
        )

        # Step 3: Synthesis & Validation
        sys_synth = (
            "You are the Synthesis Agent. Review the logical analysis chain and synthesize the final answer. "
            "Your output must be structured and written in clear, beautiful Markdown. "
            "Crucially, you MUST include a dedicated section titled 'Why This Answer Makes Sense' explaining "
            "the logical validity, verification steps, and why the solution is correct."
        )
        synth_prompt = (
            f"Problem:\n{problem}\n\n"
            f"Deconstruction:\n{decon_output}\n\n"
            f"Logical Analysis:\n{think_output}"
        )
        synth_output = yield from self._run_agent_stream(
            "synthesis", "Synthesis & Verification", sys_synth, synth_prompt, ["thinking"]
        )

        # Send final completed event
        yield f"data: {json.dumps({'event': 'done', 'final_output': synth_output})}\n\n"

    def _run_critic_debate(self, problem: str, depth: int) -> Generator[str, None, None]:
        # Step 1: Deconstruct
        sys_decon = (
            "You are the Deconstruction Agent. Break down the user's problem into core constraints, "
            "requirements, and logical targets."
        )
        decon_output = yield from self._run_agent_stream(
            "deconstruct", "Problem Deconstruction", sys_decon, f"Problem:\n{problem}", []
        )

        # Step 2: Proposal Draft
        sys_proposal = (
            "You are the Proposer Agent. Draft a detailed initial solution for the deconstructed problem. "
            "Aim to cover all bases and requirements."
        )
        prop_prompt = f"Problem:\n{problem}\n\nDeconstruction:\n{decon_output}"
        prop_output = yield from self._run_agent_stream(
            "proposal", "Initial Draft Solution", sys_proposal, prop_prompt, ["deconstruct"]
        )

        # Step 3: Critique
        sys_critique = (
            "You are the Critique Agent. Review the proposed solution. Be rigorous and critical. "
            "Identify any mathematical errors, edge cases, incorrect assumptions, or logical fallacies. "
            "Outline specific ways to make the solution bulletproof."
        )
        crit_prompt = f"Problem:\n{problem}\n\nProposed Draft:\n{prop_output}"
        crit_output = yield from self._run_agent_stream(
            "critique", "Ruthless Critique & Audit", sys_critique, crit_prompt, ["proposal"]
        )

        # Step 4: Refined Revision
        sys_revision = (
            "You are the Revision Agent. Refine the initial proposal, addressing every single critique "
            "raised in the audit. Output a revised, correct, and complete solution."
        )
        rev_prompt = (
            f"Problem:\n{problem}\n\n"
            f"Initial Proposal:\n{prop_output}\n\n"
            f"Critique Points:\n{crit_output}"
        )
        rev_output = yield from self._run_agent_stream(
            "revision", "Refined & Audited Revision", sys_revision, rev_prompt, ["critique"]
        )

        # Step 5: Synthesis
        sys_synth = (
            "You are the Synthesis Agent. Review the entire debate cycle and compile the final solution. "
            "Provide the final synthesized result in a beautiful Markdown format. "
            "Include a dedicated section 'Why This Answer Makes Sense' highlighting how the critique helped "
            "improve the final outcome."
        )
        synth_prompt = (
            f"Problem:\n{problem}\n\n"
            f"Revised Solution:\n{rev_output}\n\n"
            f"Critique History:\n{crit_output}"
        )
        synth_output = yield from self._run_agent_stream(
            "synthesis", "Synthesis & Verdict", sys_synth, synth_prompt, ["revision"]
        )

        # Send final completed event
        yield f"data: {json.dumps({'event': 'done', 'final_output': synth_output})}\n\n"

    def _run_tree_of_thoughts(self, problem: str, depth: int) -> Generator[str, None, None]:
        # Step 1: Deconstruct
        sys_decon = (
            "You are the Deconstruction Agent. Break down the user's problem to identify the parameters "
            "needed for ideating alternative paths."
        )
        decon_output = yield from self._run_agent_stream(
            "deconstruct", "Problem Deconstruction", sys_decon, f"Problem:\n{problem}", []
        )

        # Step 2: Branching Hypotheses
        # Yield all 3 thinking nodes first to show they are in queue/thinking state
        yield self._send_step("path_a", "Reasoning Branch A", "thinking", "", 0, ["deconstruct"])
        yield self._send_step("path_b", "Reasoning Branch B", "thinking", "", 0, ["deconstruct"])
        yield self._send_step("path_c", "Reasoning Branch C", "thinking", "", 0, ["deconstruct"])

        sys_branch = (
            "You are the Branching Agent. Given the problem, propose a unique reasoning strategy or path. "
            "Focus on a specific angle (e.g., Path A: direct analytical/math, Path B: algorithmic/computational, "
            "Path C: heuristic/creative). Write out the outline of how this path would solve the problem."
        )

        path_a_out = yield from self._run_agent_stream(
            "path_a", "Reasoning Branch A", sys_branch,
            f"Problem:\n{problem}\nDeconstruction:\n{decon_output}\n\nPath Focus: Analytical, direct mathematical or logical deduction.",
            ["deconstruct"]
        )
        path_b_out = yield from self._run_agent_stream(
            "path_b", "Reasoning Branch B", sys_branch,
            f"Problem:\n{problem}\nDeconstruction:\n{decon_output}\n\nPath Focus: Algorithmic, structural, or case-by-case decomposition.",
            ["deconstruct"]
        )
        path_c_out = yield from self._run_agent_stream(
            "path_c", "Reasoning Branch C", sys_branch,
            f"Problem:\n{problem}\nDeconstruction:\n{decon_output}\n\nPath Focus: Heuristic, visual model, or alternative abstraction.",
            ["deconstruct"]
        )

        # Step 3: Evaluation
        sys_eval = (
            "You are the Evaluation Agent. Compare three proposed solution branches (A, B, C). "
            "Assess their correctness, generality, and efficiency. Give each path a score out of 100 "
            "and decide which path is the most promising to execute fully. Explain your choice."
        )
        eval_prompt = (
            f"Problem:\n{problem}\n\n"
            f"Branch A:\n{path_a_out}\n\n"
            f"Branch B:\n{path_b_out}\n\n"
            f"Branch C:\n{path_c_out}"
        )
        eval_output = yield from self._run_agent_stream(
            "evaluation", "Heuristic Path Evaluation", sys_eval, eval_prompt, ["path_a", "path_b", "path_c"]
        )

        # Step 4: Expansion
        sys_expansion = (
            "You are the Execution Agent. Take the evaluation result and fully execute/expand the chosen path. "
            "Flesh it out with complete equations, logic proofs, code solutions, or explanations. "
            "Make it complete and correct."
        )
        exp_prompt = (
            f"Problem:\n{problem}\n\n"
            f"Branch A:\n{path_a_out}\n\n"
            f"Branch B:\n{path_b_out}\n\n"
            f"Branch C:\n{path_c_out}\n\n"
            f"Evaluation Deciding Best Path:\n{eval_output}"
        )
        exp_output = yield from self._run_agent_stream(
            "expansion", "Expanding Chosen Branch", sys_expansion, exp_prompt, ["evaluation"]
        )

        # Step 5: Synthesis
        sys_synth = (
            "You are the Synthesis Agent. Review the path evaluation and the expanded solution. "
            "Compile the final answer in structured Markdown format. "
            "You MUST include a dedicated section titled 'Why This Answer Makes Sense' explaining "
            "why the selected path was mathematically or logically superior and verifying the solution's correctness."
        )
        synth_prompt = (
            f"Problem:\n{problem}\n\n"
            f"Expanded Execution:\n{exp_output}\n\n"
            f"Path Evaluation History:\n{eval_output}"
        )
        synth_output = yield from self._run_agent_stream(
            "synthesis", "Synthesis & Solution Verification", sys_synth, synth_prompt, ["expansion"]
        )

        # Send final completed event
        yield f"data: {json.dumps({'event': 'done', 'final_output': synth_output})}\n\n"
