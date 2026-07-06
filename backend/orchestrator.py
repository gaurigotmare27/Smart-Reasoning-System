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
        yield self._send_step("deconstruct", "Problem Deconstruction", "thinking", "", 0, [])
        start = time.time()
        
        sys_decon = (
            "You are the Problem Deconstruction Agent. Your task is to break down the user's input "
            "into core components, key constraints, and implicit assumptions. Outline what sub-problems "
            "must be solved first."
        )
        decon_output = self._call_gemini(sys_decon, f"Problem:\n{problem}")
        duration = time.time() - start
        yield self._send_step("deconstruct", "Problem Deconstruction", "completed", decon_output, duration, [])

        # Step 2: Step-by-Step Thinking
        yield self._send_step("thinking", "Sequential Logic Chain", "thinking", "", 0, ["deconstruct"])
        start = time.time()
        sys_think = (
            "You are the Logical Analysis Agent. Work step-by-step to address the sub-problems "
            "identified in the deconstruction step. Be extremely rigorous and detail-oriented. "
            "Write out your calculations, reasoning logic, or code blocks in full detail."
        )
        think_prompt = f"Problem:\n{problem}\n\nDeconstruction Analysis:\n{decon_output}"
        think_output = self._call_gemini(sys_think, think_prompt)
        duration = time.time() - start
        yield self._send_step("thinking", "Sequential Logic Chain", "completed", think_output, duration, ["deconstruct"])

        # Step 3: Synthesis & Validation
        yield self._send_step("synthesis", "Synthesis & Verification", "thinking", "", 0, ["thinking"])
        start = time.time()
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
        synth_output = self._call_gemini(sys_synth, synth_prompt)
        duration = time.time() - start
        yield self._send_step("synthesis", "Synthesis & Verification", "completed", synth_output, duration, ["thinking"])

        # Send final completed event
        yield f"data: {json.dumps({'event': 'done', 'final_output': synth_output})}\n\n"

    def _run_critic_debate(self, problem: str, depth: int) -> Generator[str, None, None]:
        # Step 1: Deconstruct
        yield self._send_step("deconstruct", "Problem Deconstruction", "thinking", "", 0, [])
        start = time.time()
        sys_decon = (
            "You are the Deconstruction Agent. Break down the user's problem into core constraints, "
            "requirements, and logical targets."
        )
        decon_output = self._call_gemini(sys_decon, f"Problem:\n{problem}")
        duration = time.time() - start
        yield self._send_step("deconstruct", "Problem Deconstruction", "completed", decon_output, duration, [])

        # Step 2: Proposal Draft
        yield self._send_step("proposal", "Initial Draft Solution", "thinking", "", 0, ["deconstruct"])
        start = time.time()
        sys_proposal = (
            "You are the Proposer Agent. Draft a detailed initial solution for the deconstructed problem. "
            "Aim to cover all bases and requirements."
        )
        prop_prompt = f"Problem:\n{problem}\n\nDeconstruction:\n{decon_output}"
        prop_output = self._call_gemini(sys_proposal, prop_prompt)
        duration = time.time() - start
        yield self._send_step("proposal", "Initial Draft Solution", "completed", prop_output, duration, ["deconstruct"])

        # Step 3: Critique
        yield self._send_step("critique", "Ruthless Critique & Audit", "thinking", "", 0, ["proposal"])
        start = time.time()
        sys_critique = (
            "You are the Critique Agent. Review the proposed solution. Be rigorous and critical. "
            "Identify any mathematical errors, edge cases, incorrect assumptions, or logical fallacies. "
            "Outline specific ways to make the solution bulletproof."
        )
        crit_prompt = f"Problem:\n{problem}\n\nProposed Draft:\n{prop_output}"
        crit_output = self._call_gemini(sys_critique, crit_prompt)
        duration = time.time() - start
        yield self._send_step("critique", "Ruthless Critique & Audit", "completed", crit_output, duration, ["proposal"])

        # Step 4: Refined Revision
        yield self._send_step("revision", "Refined & Audited Revision", "thinking", "", 0, ["critique"])
        start = time.time()
        sys_revision = (
            "You are the Revision Agent. Refine the initial proposal, addressing every single critique "
            "raised in the audit. Output a revised, correct, and complete solution."
        )
        rev_prompt = (
            f"Problem:\n{problem}\n\n"
            f"Initial Proposal:\n{prop_output}\n\n"
            f"Critique Points:\n{crit_output}"
        )
        rev_output = self._call_gemini(sys_revision, rev_prompt)
        duration = time.time() - start
        yield self._send_step("revision", "Refined & Audited Revision", "completed", rev_output, duration, ["critique"])

        # Step 5: Synthesis
        yield self._send_step("synthesis", "Synthesis & Verdict", "thinking", "", 0, ["revision"])
        start = time.time()
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
        synth_output = self._call_gemini(sys_synth, synth_prompt)
        duration = time.time() - start
        yield self._send_step("synthesis", "Synthesis & Verdict", "completed", synth_output, duration, ["revision"])

        # Send final completed event
        yield f"data: {json.dumps({'event': 'done', 'final_output': synth_output})}\n\n"

    def _run_tree_of_thoughts(self, problem: str, depth: int) -> Generator[str, None, None]:
        # Step 1: Deconstruct
        yield self._send_step("deconstruct", "Problem Deconstruction", "thinking", "", 0, [])
        start = time.time()
        sys_decon = (
            "You are the Deconstruction Agent. Break down the user's problem to identify the parameters "
            "needed for ideating alternative paths."
        )
        decon_output = self._call_gemini(sys_decon, f"Problem:\n{problem}")
        duration = time.time() - start
        yield self._send_step("deconstruct", "Problem Deconstruction", "completed", decon_output, duration, [])

        # Step 2: Branching Hypotheses
        # Yield all 3 thinking nodes
        yield self._send_step("path_a", "Reasoning Branch A", "thinking", "", 0, ["deconstruct"])
        yield self._send_step("path_b", "Reasoning Branch B", "thinking", "", 0, ["deconstruct"])
        yield self._send_step("path_c", "Reasoning Branch C", "thinking", "", 0, ["deconstruct"])

        start = time.time()
        
        sys_branch = (
            "You are the Branching Agent. Given the problem, propose a unique reasoning strategy or path. "
            "Focus on a specific angle (e.g., Path A: direct analytical/math, Path B: algorithmic/computational, "
            "Path C: heuristic/creative). Write out the outline of how this path would solve the problem."
        )
        
        path_a_out = self._call_gemini(sys_branch, f"Problem:\n{problem}\nDeconstruction:\n{decon_output}\n\nPath Focus: Analytical, direct mathematical or logical deduction.")
        path_b_out = self._call_gemini(sys_branch, f"Problem:\n{problem}\nDeconstruction:\n{decon_output}\n\nPath Focus: Algorithmic, structural, or case-by-case decomposition.")
        path_c_out = self._call_gemini(sys_branch, f"Problem:\n{problem}\nDeconstruction:\n{decon_output}\n\nPath Focus: Heuristic, visual model, or alternative abstraction.")
        
        duration = time.time() - start
        yield self._send_step("path_a", "Reasoning Branch A", "completed", path_a_out, duration, ["deconstruct"])
        yield self._send_step("path_b", "Reasoning Branch B", "completed", path_b_out, duration, ["deconstruct"])
        yield self._send_step("path_c", "Reasoning Branch C", "completed", path_c_out, duration, ["deconstruct"])

        # Step 3: Evaluation
        yield self._send_step("evaluation", "Heuristic Path Evaluation", "thinking", "", 0, ["path_a", "path_b", "path_c"])
        start = time.time()
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
        eval_output = self._call_gemini(sys_eval, eval_prompt)
        duration = time.time() - start
        yield self._send_step("evaluation", "Heuristic Path Evaluation", "completed", eval_output, duration, ["path_a", "path_b", "path_c"])

        # Step 4: Expansion
        yield self._send_step("expansion", "Expanding Chosen Branch", "thinking", "", 0, ["evaluation"])
        start = time.time()
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
        exp_output = self._call_gemini(sys_expansion, exp_prompt)
        duration = time.time() - start
        yield self._send_step("expansion", "Expanding Chosen Branch", "completed", exp_output, duration, ["evaluation"])

        # Step 5: Synthesis
        yield self._send_step("synthesis", "Synthesis & Solution Verification", "thinking", "", 0, ["expansion"])
        start = time.time()
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
        synth_output = self._call_gemini(sys_synth, synth_prompt)
        duration = time.time() - start
        yield self._send_step("synthesis", "Synthesis & Solution Verification", "completed", synth_output, duration, ["expansion"])

        # Send final completed event
        yield f"data: {json.dumps({'event': 'done', 'final_output': synth_output})}\n\n"
